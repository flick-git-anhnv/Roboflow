import { Router } from 'express';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { db, UPLOAD_DIR, MODEL_DIR } from '../db.js';

const router = Router({ mergeParams: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const INFER_SCRIPT = path.join(__dirname, '..', 'python', 'infer.py');

// In-memory job tracker. Jobs don't need to survive a server restart — an
// auto-label run that gets interrupted can simply be re-started by the user.
const jobs = new Map();

function pickTargetImages(projectId, scope, overwrite) {
  const all = db.prepare('SELECT * FROM images WHERE project_id = ?').all(projectId);
  if (scope === 'unlabeled') return all.filter((i) => i.status !== 'labeled');
  if (overwrite) return all;
  return all.filter((i) => i.status !== 'labeled');
}

// Maps model class indices to EXISTING project classes by name only — never
// creates new classes and never relies on index/id matching, since a model's
// class order has no relation to the project's. Model classes with no
// same-name match in the project are left unmapped (their detections are
// dropped) and reported back so the user knows which ones were skipped.
function buildClassMapping(projectId, modelClassNames, cache) {
  if (cache.map) return cache.map;
  const existing = db.prepare('SELECT * FROM classes WHERE project_id = ?').all(projectId);
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const map = modelClassNames.map((name) => byName.get(String(name).trim().toLowerCase()) || null);
  cache.map = map;
  cache.unmatched = modelClassNames.filter((name, i) => !map[i]);
  return map;
}

function saveDetectionsForImage(imageId, boxes, classIdMap) {
  const rows = boxes.map((b) => {
    const classId = classIdMap[b.class_index];
    if (!classId) return null;
    if (b.type === 'quad' && Array.isArray(b.points) && b.points.length === 4) {
      const xs = b.points.map((p) => p.x), ys = b.points.map((p) => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      return {
        class_id: classId, type: 'quad',
        x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y,
        points: JSON.stringify(b.points),
      };
    }
    return { class_id: classId, type: 'bbox', x: b.x, y: b.y, w: b.w, h: b.h, points: null };
  }).filter(Boolean);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM annotations WHERE image_id = ?').run(imageId);
    const insert = db.prepare(`
      INSERT INTO annotations (id, image_id, class_id, x, y, w, h, type, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of rows) {
      insert.run(nanoid(), imageId, r.class_id, r.x, r.y, r.w, r.h, r.type, r.points);
    }
    db.prepare("UPDATE images SET status = ? WHERE id = ?").run(rows.length > 0 ? 'labeled' : 'unlabeled', imageId);
  });
  tx();

  return rows.length;
}

router.post('/', (req, res) => {
  const { projectId } = req.params;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  const { model_id, confidence, scope, overwrite } = req.body;
  const model = db.prepare('SELECT * FROM models WHERE id = ? AND project_id = ?').get(model_id, projectId);
  if (!model) return res.status(400).json({ error: 'Không tìm thấy model đã chọn' });

  const targets = pickTargetImages(projectId, scope === 'unlabeled' ? 'unlabeled' : 'all', !!overwrite);
  if (!targets.length) {
    return res.status(400).json({ error: 'Không có ảnh nào phù hợp để gán nhãn tự động (kiểm tra lại phạm vi/ghi đè)' });
  }

  const jobId = nanoid();
  const job = { status: 'running', total: targets.length, done: 0, created: 0, failed: 0, error: null, unmatchedClasses: [] };
  jobs.set(jobId, job);

  const modelPath = path.join(MODEL_DIR, projectId, model.filename);
  const conf = Math.min(0.95, Math.max(0.01, parseFloat(confidence) || 0.25));
  const images = targets.map((img) => ({ id: img.id, path: path.join(UPLOAD_DIR, projectId, img.filename) }));

  runInference(projectId, modelPath, conf, images, job);

  res.status(202).json({ jobId, total: job.total });
});

function runInference(projectId, modelPath, conf, images, job) {
  const child = spawn(PYTHON_BIN, [INFER_SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
  const classCache = {};
  let stderrBuf = '';

  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    if (stderrBuf.length > 4000) stderrBuf = stderrBuf.slice(-4000);
  });

  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    if (msg.done) return;

    if (Array.isArray(msg.classes)) {
      const classIdMap = buildClassMapping(projectId, msg.classes, classCache);
      if (job.unmatchedClasses.length === 0 && classCache.unmatched.length) {
        job.unmatchedClasses = classCache.unmatched;
      }
      if (msg.error) {
        job.failed += 1;
      } else if (Array.isArray(msg.boxes)) {
        job.created += saveDetectionsForImage(msg.image_id, msg.boxes, classIdMap);
      }
      job.done += 1;
    }
  });

  child.on('error', (err) => {
    job.status = 'error';
    job.error = `Không thể chạy Python (${PYTHON_BIN}): ${err.message}. Hãy chắc chắn đã cài Python và "pip install ultralytics".`;
  });

  child.on('close', (code) => {
    if (job.status === 'error') return;
    if (code !== 0 && job.done < job.total) {
      job.status = 'error';
      job.error = stderrBuf.trim() || `Tiến trình Python thoát với mã lỗi ${code}`;
    } else {
      job.status = 'done';
    }
  });

  child.stdin.write(JSON.stringify({ model_path: modelPath, conf, images }));
  child.stdin.end();
}

router.get('/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy tác vụ' });
  res.json(job);
});

export default router;

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

// ─── Inference service config ─────────────────────────────────────────────────
// USE_LEGACY_INFER=1  → dùng spawn infer.py cũ (rollback)
// Mặc định           → gọi HTTP tới FastAPI service tại INFERENCE_PORT
const INFERENCE_PORT = process.env.INFERENCE_PORT || '8001';
const INFERENCE_URL = `http://127.0.0.1:${INFERENCE_PORT}`;
const INFERENCE_BATCH_SIZE = 32;
const USE_LEGACY_INFER = process.env.USE_LEGACY_INFER === '1';

// In-memory tracker cho các job ĐANG CHẠY (fast polling trong quá trình inference).
// Khi inference xong → state được sync vào DB, entry được xoá khỏi Map.
// Job đã hoàn thành / sau restart → đọc từ DB (GET handler fall-back bên dưới).
const jobs = new Map();

// ─── DB helpers cho jobs ──────────────────────────────────────────────────────

/** Tạo row mới trong bảng jobs khi bắt đầu job. */
function createJobInDB(id, projectId, total, modelId) {
  db.prepare(`
    INSERT INTO jobs
      (id, project_id, status, total_images, model_id, processed,
       created_annotations, failed, unmatched_classes, updated_at)
    VALUES (?, ?, 'running', ?, ?, 0, 0, 0, '[]', datetime('now'))
  `).run(id, projectId, total, modelId);
}

/** Đồng bộ state in-memory job vào DB (gọi khi job hoàn thành hoặc định kỳ). */
function syncJobToDB(id, job) {
  db.prepare(`
    UPDATE jobs SET
      status              = ?,
      processed           = ?,
      created_annotations = ?,
      failed              = ?,
      error_msg           = ?,
      unmatched_classes   = ?,
      updated_at          = datetime('now')
    WHERE id = ?
  `).run(
    job.status,
    job.done,
    job.created,
    job.failed,
    job.error || null,
    JSON.stringify(job.unmatchedClasses || []),
    id,
  );
}

/** Đọc job từ DB và trả về shape giống in-memory job object. */
function getJobFromDB(id) {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!row) return null;
  return {
    status: row.status,
    total: row.total_images,
    done: row.processed,
    created: row.created_annotations,
    failed: row.failed,
    error: row.error_msg || null,
    unmatchedClasses: JSON.parse(row.unmatched_classes || '[]'),
  };
}

// ─── Helper: chọn ảnh cần inference ─────────────────────────────────────────

function pickTargetImages(projectId, scope, overwrite) {
  const all = db.prepare('SELECT * FROM images WHERE project_id = ?').all(projectId);
  if (scope === 'unlabeled') return all.filter((i) => i.status !== 'labeled');
  if (overwrite) return all;
  return all.filter((i) => i.status !== 'labeled');
}

// ─── Helper: map tên class model → class_id trong project ────────────────────

function buildClassMapping(projectId, modelClassNames, cache) {
  if (cache.map) return cache.map;
  const existing = db.prepare('SELECT * FROM classes WHERE project_id = ?').all(projectId);
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const map = modelClassNames.map((name) => byName.get(String(name).trim().toLowerCase()) || null);
  cache.map = map;
  cache.unmatched = modelClassNames.filter((name, i) => !map[i]);
  return map;
}

// ─── Helper: lưu detections của 1 ảnh vào DB ─────────────────────────────────

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
    db.prepare('UPDATE images SET status = ? WHERE id = ?').run(
      rows.length > 0 ? 'labeled' : 'unlabeled', imageId,
    );
  });
  tx();

  return rows.length;
}

// ─── Health check: kiểm tra FastAPI service sẵn sàng chưa ────────────────────

/**
 * Gọi GET /health trên inference service.
 * Trả về true nếu service up, false nếu timeout hoặc lỗi mạng.
 */
async function checkInferenceHealth() {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${INFERENCE_URL}/health`, { signal: controller.signal });
      return res.ok;
    } finally {
      clearTimeout(tid);
    }
  } catch {
    return false;
  }
}

// ─── Mode MỚI: HTTP → FastAPI service ────────────────────────────────────────

/**
 * Chạy inference qua HTTP tới FastAPI service thường trực.
 * Chia job thành batch INFERENCE_BATCH_SIZE=32 ảnh, cập nhật job.done sau mỗi batch.
 * Cập nhật job object in-place; không trả về giá trị.
 */
async function runInferenceHTTP(projectId, modelPath, conf, images, job) {
  const classCache = {};

  for (let i = 0; i < images.length; i += INFERENCE_BATCH_SIZE) {
    const batch = images.slice(i, i + INFERENCE_BATCH_SIZE);
    const batchNum = Math.floor(i / INFERENCE_BATCH_SIZE) + 1;

    try {
      const controller = new AbortController();
      // Timeout 5 phút/batch — đủ cho batch lớn trên CPU chậm
      const tid = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      let response;
      try {
        response = await fetch(`${INFERENCE_URL}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_path: modelPath, conf, images: batch }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(tid);
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error(`[autolabel] Batch ${batchNum} HTTP ${response.status}: ${errText}`);
        job.failed += batch.length;
        job.done += batch.length;
        continue;
      }

      const data = await response.json();
      const { classes = [], results = [], errors = [] } = data;

      // buildClassMapping cache kết quả sau lần gọi đầu tiên (same model, same classes)
      const classIdMap = buildClassMapping(projectId, classes, classCache);
      if (classCache.unmatched?.length && job.unmatchedClasses.length === 0) {
        job.unmatchedClasses = classCache.unmatched;
      }

      for (const result of results) {
        job.created += saveDetectionsForImage(result.image_id, result.detections, classIdMap);
        job.done += 1;
      }

      for (const err of errors) {
        console.error(`[autolabel] Image ${err.image_id} inference error: ${err.error}`);
        job.failed += 1;
        job.done += 1;
      }

    } catch (err) {
      const reason = err.name === 'AbortError' ? 'timeout (5 min)' : err.message;
      console.error(`[autolabel] Batch ${batchNum} failed: ${reason}`);
      job.failed += batch.length;
      job.done += batch.length;
    }
  }

  job.status = 'done';
}

// ─── Mode CŨ (LEGACY): spawn infer.py mỗi lần (USE_LEGACY_INFER=1) ───────────

/**
 * Giữ nguyên để rollback — KHÔNG XÓA.
 * Kích hoạt bằng env USE_LEGACY_INFER=1.
 */
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

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

    const { model_id, confidence, scope, overwrite } = req.body;
    const model = db.prepare('SELECT * FROM models WHERE id = ? AND project_id = ?').get(model_id, projectId);
    if (!model) return res.status(400).json({ error: 'Không tìm thấy model đã chọn' });

    const targets = pickTargetImages(projectId, scope === 'unlabeled' ? 'unlabeled' : 'all', !!overwrite);
    if (!targets.length) {
      return res.status(400).json({
        error: 'Không có ảnh nào phù hợp để gán nhãn tự động (kiểm tra lại phạm vi/ghi đè)',
      });
    }

    // Kiểm tra inference service — chỉ khi không dùng legacy mode
    if (!USE_LEGACY_INFER) {
      const healthy = await checkInferenceHealth();
      if (!healthy) {
        return res.status(503).json({
          error: 'INFERENCE_UNAVAILABLE',
          message: 'Inference service chưa sẵn sàng. Vui lòng chờ vài giây rồi thử lại, hoặc khởi động lại server.',
        });
      }
    }

    const jobId = nanoid();
    const job = {
      status: 'running', total: targets.length, done: 0,
      created: 0, failed: 0, error: null, unmatchedClasses: [],
    };
    jobs.set(jobId, job);

    // Persist job row vào DB ngay khi bắt đầu.
    // Nếu server restart trước khi job xong → startup migration trong db.js
    // sẽ đánh dấu job này là error ('Server restarted while job was in progress').
    createJobInDB(jobId, projectId, targets.length, model_id);

    const modelPath = path.join(MODEL_DIR, projectId, model.filename);
    const conf = Math.min(0.95, Math.max(0.01, parseFloat(confidence) || 0.25));
    const images = targets.map((img) => ({
      id: img.id,
      path: path.join(UPLOAD_DIR, projectId, img.filename),
    }));

    if (USE_LEGACY_INFER) {
      // Legacy mode: runInference dùng event callbacks (không phải Promise).
      // Dùng interval 500ms để phát hiện khi job kết thúc và sync lần cuối vào DB.
      runInference(projectId, modelPath, conf, images, job);
      const legacySyncTimer = setInterval(() => {
        if (job.status === 'done' || job.status === 'error') {
          syncJobToDB(jobId, job);
          jobs.delete(jobId);
          clearInterval(legacySyncTimer);
        }
      }, 500);
    } else {
      // HTTP mode: hook vào Promise để sync ngay khi inference kết thúc.
      runInferenceHTTP(projectId, modelPath, conf, images, job)
        .then(() => {
          syncJobToDB(jobId, job);
          jobs.delete(jobId);
        })
        .catch((err) => {
          job.status = 'error';
          job.error = `Lỗi inference: ${err.message}`;
          syncJobToDB(jobId, job);
          jobs.delete(jobId);
        });
    }

    res.status(202).json({ jobId, total: job.total });
  } catch (err) {
    console.error('[autolabel] Unexpected error in POST /:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:jobId', (req, res) => {
  // 1. Kiểm tra in-memory Map trước (job đang chạy — phản hồi nhanh nhất)
  const liveJob = jobs.get(req.params.jobId);
  if (liveJob) return res.json(liveJob);

  // 2. Fall-back: đọc từ DB (job đã hoàn thành, hoặc sau restart)
  const dbJob = getJobFromDB(req.params.jobId);
  if (!dbJob) return res.status(404).json({ error: 'Không tìm thấy tác vụ' });
  res.json(dbJob);
});

export default router;

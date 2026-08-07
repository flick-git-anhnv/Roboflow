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
// USE_LEGACY_INFER=1  → dùng spawn infer.py cũ (rollback, KHÔNG có cache)
// Mặc định           → gọi HTTP tới FastAPI service tại INFERENCE_PORT (có cache)
const INFERENCE_PORT = process.env.INFERENCE_PORT || '8001';
const INFERENCE_URL = `http://127.0.0.1:${INFERENCE_PORT}`;
const INFERENCE_BATCH_SIZE = 32;
const USE_LEGACY_INFER = process.env.USE_LEGACY_INFER === '1';

// STEP-4.1: Threshold thấp dùng khi gọi inference để build cache.
// Lưu raw detections ở conf>=0.01 → Node.js tự lọc theo conf user tại application layer.
// Cho phép đổi conf threshold mà không detect lại.
const CACHE_RAW_CONF = 0.01;

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

function pickTargetImages(projectId, scope, overwrite, imageIds = null) {
  let all;
  if (scope === 'selected' && Array.isArray(imageIds) && imageIds.length > 0) {
    const placeholders = imageIds.map(() => '?').join(',');
    all = db.prepare(`SELECT * FROM images WHERE project_id = ? AND id IN (${placeholders})`).all(projectId, ...imageIds);
  } else {
    all = db.prepare('SELECT * FROM images WHERE project_id = ?').all(projectId);
  }

  if (scope === 'unlabeled') return all.filter((i) => i.status !== 'labeled');
  if (overwrite) return all;
  return all.filter((i) => i.status !== 'labeled');
}

// ─── Helper: map tên class model → class_id trong project ────────────────────

function buildClassMapping(projectId, modelClassNames, cache) {
  if (cache.map && cache.map.length > 0) return cache.map;
  if (!modelClassNames || modelClassNames.length === 0) return [];
  const existing = db.prepare('SELECT * FROM classes WHERE project_id = ?').all(projectId);
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const map = modelClassNames.map((name) => byName.get(String(name).trim().toLowerCase()) || null);
  cache.map = map;
  cache.unmatched = modelClassNames.filter((name, i) => !map[i]);
  return map;
}

function getIoU(box1, box2) {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.w, box2.x + box2.w);
  const y2 = Math.min(box1.y + box1.h, box2.y + box2.h);
  
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersection === 0) return 0;
  
  const union = (box1.w * box1.h) + (box2.w * box2.h) - intersection;
  return intersection / union;
}

function getCenterDistance(box1, box2) {
  const cx1 = box1.x + box1.w / 2;
  const cy1 = box1.y + box1.h / 2;
  const cx2 = box2.x + box2.w / 2;
  const cy2 = box2.y + box2.h / 2;
  return Math.sqrt(Math.pow(cx1 - cx2, 2) + Math.pow(cy1 - cy2, 2));
}

function matchDetectionsToAnnotations(annots, detections, classIdMap) {
  const matches = new Map(); // annotId -> classId
  if (!annots.length || !detections.length) return matches;

  // Scenario 1: Exact matching counts (e.g. License Plates characters) -> Sort by X coordinate
  if (annots.length === detections.length) {
    const sortedAnnots = [...annots].sort((a, b) => a.x - b.x);
    const sortedDetections = [...detections].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sortedAnnots.length; i++) {
      const classId = classIdMap[sortedDetections[i].class_index];
      if (classId) matches.set(sortedAnnots[i].id, classId);
    }
    return matches;
  }

  // Scenario 2: Standard spatial matching (IoU + distance fallback) - Loop through detections to pair with best annotation
  const matchedAnnotIds = new Set();
  
  for (const det of detections) {
    let bestAnnot = null;
    let bestIoU = 0;
    
    // 1. Try IoU matching first among unmatched annotations
    for (const annot of annots) {
      if (matchedAnnotIds.has(annot.id)) continue;
      const iou = getIoU(annot, det);
      if (iou > bestIoU && iou > 0.1) {
        bestIoU = iou;
        bestAnnot = annot;
      }
    }

    // 2. Distance fallback if IoU is zero
    if (!bestAnnot) {
      let minDist = Infinity;
      for (const annot of annots) {
        if (matchedAnnotIds.has(annot.id)) continue;
        const dist = getCenterDistance(annot, det);
        if (dist < minDist) {
          minDist = dist;
          bestAnnot = annot;
        }
      }
    }

    if (bestAnnot) {
      const classId = classIdMap[det.class_index];
      if (classId) {
        matches.set(bestAnnot.id, classId);
        matchedAnnotIds.add(bestAnnot.id);
      }
    }
  }

  return matches;
}

// ─── Helper: lưu detections của 1 ảnh vào DB ─────────────────────────────────

function saveDetectionsForImage(imageId, boxes, classIdMap, modelMode = 'both', projectId = null, modelClassNames = []) {
  // 1. TEXT RECOGNIZE MODE: split recognized text string and assign to sorted existing annotations OR save as full text_rec annotation
  if (modelMode === 'text_recognize') {
    if (!modelClassNames || modelClassNames.length === 0 || boxes.length === 0) return 0;

    // Get the recognized text from the highest confidence prediction
    const bestBox = [...boxes].sort((a, b) => (b.conf || 0) - (a.conf || 0))[0];
    const textString = modelClassNames[bestBox.class_index];
    if (!textString) return 0;

    const project = projectId ? db.prepare('SELECT label_type FROM projects WHERE id = ?').get(projectId) : null;
    const labelType = project?.label_type || 'bbox';

    if (labelType === 'text_rec') {
      // Save the entire text string as a single text_rec annotation
      let defaultClass = projectId ? db.prepare('SELECT id FROM classes WHERE project_id = ? LIMIT 1').get(projectId) : null;
      if (!defaultClass && projectId) {
        const defaultClassId = nanoid();
        db.prepare('INSERT INTO classes (id, project_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)')
          .run(defaultClassId, projectId, 'text', '#F05922', 0);
        defaultClass = { id: defaultClassId };
      }
      const defaultClassId = defaultClass?.id;
      if (!defaultClassId) return 0;

      let updatedCount = 0;
      const tx = db.transaction(() => {
        db.prepare('DELETE FROM annotations WHERE image_id = ?').run(imageId);
        db.prepare(`
          INSERT INTO annotations (id, image_id, class_id, x, y, w, h, type, points, text_content)
          VALUES (?, ?, ?, 0, 0, 0, 0, 'text_rec', null, ?)
        `).run(nanoid(), imageId, defaultClassId, textString);
        db.prepare("UPDATE images SET status = 'labeled' WHERE id = ?").run(imageId);
        updatedCount = 1;
      });
      tx();
      return updatedCount;
    } else {
      // Clean and split the text string into characters
      const cleanText = textString.replace(/[\s\-\.]/g, '');
      const chars = cleanText.split('');

      // Query existing annotations for this image
      const existingAnnots = db.prepare('SELECT * FROM annotations WHERE image_id = ?').all(imageId);
      if (existingAnnots.length === 0 || chars.length === 0) return 0;

      // Sort existing annotations from left to right (by X coordinate)
      const sortedAnnots = [...existingAnnots].sort((a, b) => a.x - b.x);

      // Get project's classes
      const existingClasses = db.prepare('SELECT * FROM classes WHERE project_id = ?').all(projectId);
      const classMap = new Map(existingClasses.map(c => [c.name.trim().toLowerCase(), c.id]));

      // Map each character to project's class ID
      const classIds = chars.map(char => classMap.get(char.toLowerCase())).filter(Boolean);
      if (classIds.length === 0) return 0;

      let updatedCount = 0;
      const tx = db.transaction(() => {
        const update = db.prepare('UPDATE annotations SET class_id = ? WHERE id = ?');
        for (let i = 0; i < Math.min(sortedAnnots.length, classIds.length); i++) {
          update.run(classIds[i], sortedAnnots[i].id);
          updatedCount++;
        }
      });
      tx();

      return updatedCount;
    }
  }

  // 2. CLASS ONLY MODE: update classes of existing annotations
  if (modelMode === 'class_only') {
    const existingAnnots = db.prepare('SELECT * FROM annotations WHERE image_id = ?').all(imageId);
    if (existingAnnots.length === 0 || boxes.length === 0) return 0;
    
    const matches = matchDetectionsToAnnotations(existingAnnots, boxes, classIdMap);
    let updatedCount = 0;
    
    const tx = db.transaction(() => {
      const update = db.prepare('UPDATE annotations SET class_id = ? WHERE id = ?');
      for (const [annotId, classId] of matches.entries()) {
        update.run(classId, annotId);
        updatedCount++;
      }
    });
    tx();
    
    return updatedCount;
  }

  // 2. BOTH / BOX ONLY MODE: insert new boxes
  const defaultClassId = projectId ? db.prepare('SELECT id FROM classes WHERE project_id = ? LIMIT 1').get(projectId)?.id : null;

  const rows = boxes.map((b) => {
    const classId = classIdMap[b.class_index] || (modelMode === 'box_only' ? defaultClassId : null);
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

// ─── STEP-4.1: detect_cache helpers ──────────────────────────────────────────

/**
 * Lấy raw_detections từ detect_cache cho (imageId, modelId).
 * Trả về object {classes, boxes} hoặc null nếu cache miss / parse lỗi.
 */
function getCachedDetections(imageId, modelId) {
  try {
    const row = db
      .prepare('SELECT raw_detections FROM detect_cache WHERE image_id = ? AND model_id = ?')
      .get(imageId, modelId);
    if (!row) return null;
    return JSON.parse(row.raw_detections);
  } catch {
    return null;
  }
}

/**
 * Lưu raw detections (chưa áp threshold) vào detect_cache.
 * Dùng INSERT OR REPLACE để cập nhật nếu đã có entry.
 * rawDetectionsObj = { classes: string[], boxes: [{class_index, conf, x,y,w,h, type, points?}] }
 */
function saveToCacheDetections(imageId, modelId, rawDetectionsObj) {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO detect_cache (image_id, model_id, raw_detections, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(imageId, modelId, JSON.stringify(rawDetectionsObj));
  } catch (e) {
    console.error(`[detect_cache] Save failed for ${imageId}/${modelId}:`, e.message);
  }
}

/**
 * Lọc raw boxes theo conf threshold ở tầng application.
 * Boxes không có field `conf` (cache cũ trước STEP-4.1) → coi là đã pass (conf=1).
 * @param {Array} boxes — mảng box từ raw_detections.boxes
 * @param {number} confThreshold — threshold user (0-1)
 * @returns {Array} — chỉ giữ box có conf >= threshold
 */
function filterRawBoxesByConf(boxes, confThreshold) {
  return boxes.filter((b) => (b.conf ?? 1) >= confThreshold);
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

// ─── Mode MỚI: HTTP → FastAPI service (với detect_cache) ─────────────────────

/**
 * Chạy inference qua HTTP tới FastAPI service thường trực.
 * STEP-4.1: Tích hợp detect_cache —
 *   - Cache hit  → lấy raw_detections từ DB, lọc conf threshold ở application layer
 *   - Cache miss → gọi inference với CACHE_RAW_CONF (0.01), lưu raw vào cache,
 *                  rồi lọc theo conf user trước khi lưu annotations
 *
 * Chia job thành batch INFERENCE_BATCH_SIZE=32 ảnh.
 * Cập nhật job object in-place; không trả về giá trị.
 *
 * @param {string} projectId
 * @param {string} modelId   — id trong bảng models (FK cho detect_cache)
 * @param {string} modelPath — đường dẫn file .pt để gọi inference service
 * @param {number} conf      — threshold user (áp dụng ở application layer với cache)
 * @param {Array}  images    — [{id, path}]
 * @param {object} job       — in-memory job state
 */
async function runInferenceHTTP(projectId, modelId, modelPath, conf, images, job, modelMode = 'both') {
  const classCache = {};

  for (let i = 0; i < images.length; i += INFERENCE_BATCH_SIZE) {
    const batch = images.slice(i, i + INFERENCE_BATCH_SIZE);
    const batchNum = Math.floor(i / INFERENCE_BATCH_SIZE) + 1;

    // ── Phân loại cache hit / miss ─────────────────────────────────────────
    const hits   = []; // { img, cached: {classes, boxes} }
    const misses = []; // img objects cần gọi inference

    for (const img of batch) {
      const cached = getCachedDetections(img.id, modelId);
      if (cached) {
        hits.push({ img, cached });
      } else {
        misses.push(img);
      }
    }

    // ── Xử lý cache hits (không gọi inference) ────────────────────────────
    for (const { img, cached } of hits) {
      try {
        const classIdMap = buildClassMapping(projectId, cached.classes ?? [], classCache);
        if (classCache.unmatched?.length && job.unmatchedClasses.length === 0) {
          job.unmatchedClasses = classCache.unmatched;
        }
        // Áp threshold ở application layer — cho phép đổi conf mà không detect lại
        const filtered = filterRawBoxesByConf(cached.boxes ?? [], conf);
        job.created += saveDetectionsForImage(img.id, filtered, classIdMap, modelMode, projectId, cached.classes);
        job.done += 1;
        console.log(`[detect_cache] HIT  image=${img.id} model=${modelId}`);
      } catch (err) {
        console.error(`[detect_cache] Error applying cache for ${img.id}: ${err.message}`);
        job.failed += 1;
        job.done += 1;
      }
    }

    // ── Xử lý cache misses qua HTTP ───────────────────────────────────────
    if (misses.length > 0) {
      try {
        const controller = new AbortController();
        // Timeout 5 phút/batch — đủ cho batch lớn trên CPU chậm
        const tid = setTimeout(() => controller.abort(), 5 * 60 * 1000);

        let response;
        try {
          response = await fetch(`${INFERENCE_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model_path: modelPath,
              // Gọi với conf thấp (CACHE_RAW_CONF) để lưu raw boxes vào cache.
              // Threshold user (conf) được áp ở application layer sau khi lấy cache.
              conf: CACHE_RAW_CONF,
              images: misses,
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(tid);
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error(`[autolabel] Batch ${batchNum} HTTP ${response.status}: ${errText}`);
          job.failed += misses.length;
          job.done += misses.length;
          continue;
        }

        const data = await response.json();
        const { classes = [], results = [], errors = [] } = data;

        // buildClassMapping cache kết quả sau lần gọi đầu tiên (same model)
        const classIdMap = buildClassMapping(projectId, classes, classCache);
        if (classCache.unmatched?.length && job.unmatchedClasses.length === 0) {
          job.unmatchedClasses = classCache.unmatched;
        }

        for (const result of results) {
          // Lưu raw detections (CACHE_RAW_CONF, không áp threshold user) vào cache
          saveToCacheDetections(result.image_id, modelId, {
            classes,
            boxes: result.detections,
          });
          console.log(`[detect_cache] MISS image=${result.image_id} model=${modelId} — saved to cache`);

          // Áp conf threshold user ở application layer trước khi lưu annotations
          const filtered = filterRawBoxesByConf(result.detections, conf);
          job.created += saveDetectionsForImage(result.image_id, filtered, classIdMap, modelMode, projectId, classes);
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
        job.failed += misses.length;
        job.done += misses.length;
      }
    }
  }

  job.status = 'done';
}

// ─── Mode CŨ (LEGACY): spawn infer.py mỗi lần (USE_LEGACY_INFER=1) ───────────

/**
 * Giữ nguyên để rollback — KHÔNG XÓA.
 * Kích hoạt bằng env USE_LEGACY_INFER=1.
 */
function runInference(projectId, modelPath, conf, images, job, modelMode = 'both') {
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
        job.created += saveDetectionsForImage(msg.image_id, msg.boxes, classIdMap, modelMode, projectId, msg.classes);
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

    const { model_id, confidence, scope, overwrite, image_ids, model_mode = 'both' } = req.body;
    const model = db.prepare('SELECT * FROM models WHERE id = ? AND project_id = ?').get(model_id, projectId);
    if (!model) return res.status(400).json({ error: 'Không tìm thấy model đã chọn' });

    const targets = pickTargetImages(projectId, scope, !!overwrite, image_ids);
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
      // NOTE: Legacy mode KHÔNG dùng detect_cache (chỉ HTTP mode mới có cache).
      runInference(projectId, modelPath, conf, images, job, model_mode);
      const legacySyncTimer = setInterval(() => {
        if (job.status === 'done' || job.status === 'error') {
          syncJobToDB(jobId, job);
          jobs.delete(jobId);
          clearInterval(legacySyncTimer);
        }
      }, 500);
    } else {
      // HTTP mode (STEP-4.1): truyền model_id để cache theo (image_id, model_id).
      runInferenceHTTP(projectId, model_id, modelPath, conf, images, job, model_mode)
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

// ─── STEP-4.1: Cache management endpoints ─────────────────────────────────────

/**
 * DELETE /api/projects/:projectId/auto-label/cache
 * Xoá detect_cache entries theo ảnh và/hoặc model.
 * Query params (tuỳ chọn, có thể kết hợp):
 *   ?imageId=<id>   — chỉ xoá cache của ảnh này
 *   ?modelId=<id>   — chỉ xoá cache của model này
 *   (không có param) — xoá toàn bộ cache của project
 *
 * Dùng khi: user đổi model, muốn force re-detect, hoặc cần làm sạch cache cũ.
 * Auth: yêu cầu đăng nhập (mọi role).
 * Response: { deleted: <số dòng đã xoá> }
 */
router.delete('/cache', (req, res) => {
  try {
    const { projectId } = req.params;
    const { imageId, modelId } = req.query;

    // Verify project tồn tại
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

    // Xoá theo project (subquery) + filter tùy chọn theo imageId / modelId
    // Dùng subquery images WHERE project_id để scoped đúng project
    let sql = `
      DELETE FROM detect_cache
      WHERE image_id IN (SELECT id FROM images WHERE project_id = ?)
    `;
    const params = [projectId];

    if (imageId) {
      sql += ' AND image_id = ?';
      params.push(imageId);
    }
    if (modelId) {
      sql += ' AND model_id = ?';
      params.push(modelId);
    }

    const result = db.prepare(sql).run(...params);
    console.log(`[detect_cache] DELETE project=${projectId} imageId=${imageId ?? '*'} modelId=${modelId ?? '*'} → ${result.changes} rows`);
    res.json({ deleted: result.changes });
  } catch (err) {
    console.error('[detect_cache] DELETE /cache error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

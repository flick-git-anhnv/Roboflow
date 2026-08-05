/**
 * STEP-4.2: Prefill bbox tự động khi mở ảnh chưa có annotation.
 *
 * Endpoints:
 *   GET  /api/projects/:projectId/images/:imageId/prefill
 *        → trả { suggestions: Box[] } từ detect_cache hoặc inference service.
 *        → { suggestions: [] } nếu ảnh đã có annotation, hoặc cache miss khi legacy mode.
 *        → 422 nếu project chưa cấu hình default_model_id.
 *        Auth: tất cả role (authRequired global đã cover ở index.js).
 *
 *   PATCH /api/projects/:projectId/default-model
 *        → đặt model mặc định cho project ({ model_id: string|null }).
 *        Auth: reviewer, admin.
 *
 * Cache logic tái sử dụng từ STEP-4.1 (autolabel.js):
 *   - getCachedDetections / saveToCacheDetections / filterRawBoxesByConf
 *   - Định nghĩa lại inline (autolabel.js không export) — logic đồng nhất.
 *   - CACHE_RAW_CONF = 0.01 (giữ nhất quán với autolabel.js để cache tương thích).
 */

import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, UPLOAD_DIR, MODEL_DIR } from '../db.js';
import { requireRole } from '../middleware/roles.js';

const router = Router({ mergeParams: true });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Constants (đồng nhất với autolabel.js) ───────────────────────────────────
const INFERENCE_PORT = process.env.INFERENCE_PORT || '8001';
const INFERENCE_URL  = `http://127.0.0.1:${INFERENCE_PORT}`;
const CACHE_RAW_CONF  = 0.01;   // threshold khi gọi inference để build cache raw
const PREFILL_DEFAULT_CONF = 0.4; // conf mặc định để filter gợi ý trả cho client
const USE_LEGACY_INFER = process.env.USE_LEGACY_INFER === '1';

// ── detect_cache helpers (đồng nhất với autolabel.js) ────────────────────────

function getCachedDetections(imageId, modelId) {
  try {
    const row = db
      .prepare('SELECT raw_detections FROM detect_cache WHERE image_id = ? AND model_id = ?')
      .get(imageId, modelId);
    if (!row) return null;
    return JSON.parse(row.raw_detections);
  } catch { return null; }
}

function saveToCacheDetections(imageId, modelId, rawDetectionsObj) {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO detect_cache (image_id, model_id, raw_detections, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(imageId, modelId, JSON.stringify(rawDetectionsObj));
  } catch (e) {
    console.error(`[prefill/cache] Save failed for ${imageId}/${modelId}:`, e.message);
  }
}

function filterRawBoxesByConf(boxes, confThreshold) {
  return boxes.filter((b) => (b.conf ?? 1) >= confThreshold);
}

// ── Helper: map raw detections → suggestions (class_id mapped) ───────────────

function buildSuggestions(projectId, classes, boxes, conf) {
  const existing = db.prepare('SELECT id, name FROM classes WHERE project_id = ?').all(projectId);
  const byName   = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));

  return filterRawBoxesByConf(boxes, conf)
    .map((b) => {
      const className = classes[b.class_index] ?? '';
      const class_id  = byName.get(String(className).trim().toLowerCase());
      if (!class_id) return null; // class name không khớp với project classes → bỏ qua
      return {
        class_id,
        x: b.x, y: b.y, w: b.w, h: b.h,
        type:   b.type   ?? 'bbox',
        conf:   b.conf   ?? 1,
        points: b.points ?? null,
      };
    })
    .filter(Boolean);
}

// ── Helper: kiểm tra inference service health ─────────────────────────────────

async function checkInferenceHealth() {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${INFERENCE_URL}/health`, { signal: controller.signal });
      return res.ok;
    } finally { clearTimeout(tid); }
  } catch { return false; }
}

// ── GET /api/projects/:projectId/images/:imageId/prefill ──────────────────────
//
// Trả gợi ý bbox cho ảnh chưa có annotation nào.
// Flow:
//   1. Validate project + image (404 nếu không tồn tại)
//   2. Ảnh đã có annotation → trả { suggestions: [] } (không cần prefill)
//   3. Chưa cấu hình default_model_id → 422 NO_DEFAULT_MODEL
//   4. Cache hit  → filter conf → map class_id → trả ngay (không gọi inference)
//   5. Cache miss → gọi inference (CACHE_RAW_CONF) → lưu cache → filter → trả
//
// Query param ?conf=0.4 (optional) — override PREFILL_DEFAULT_CONF.
// Auth: tất cả role (authRequired global ở index.js cover rồi).

router.get('/images/:imageId/prefill', async (req, res) => {
  try {
    const { projectId, imageId } = req.params;
    const conf = Math.min(0.99, Math.max(0.01, parseFloat(req.query.conf) || PREFILL_DEFAULT_CONF));

    // 1. Validate project
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

    // 2. Validate image belongs to project
    const image = db.prepare('SELECT * FROM images WHERE id = ? AND project_id = ?')
      .get(imageId, projectId);
    if (!image) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

    // 3. Ảnh đã có annotation → không cần prefill
    const annotCount = db.prepare('SELECT COUNT(*) AS n FROM annotations WHERE image_id = ?')
      .get(imageId).n;
    if (annotCount > 0) {
      return res.json({ suggestions: [] });
    }

    // 4. Kiểm tra default model
    if (!project.default_model_id) {
      return res.status(422).json({
        error:   'NO_DEFAULT_MODEL',
        message: 'Project chưa có model mặc định. Vào trang project → chọn model → "Đặt làm mặc định".',
      });
    }

    // 5. Model tồn tại không?
    const model = db.prepare('SELECT * FROM models WHERE id = ? AND project_id = ?')
      .get(project.default_model_id, projectId);
    if (!model) {
      return res.status(422).json({
        error:   'DEFAULT_MODEL_NOT_FOUND',
        message: 'Model mặc định đã bị xoá hoặc không thuộc project. Hãy chọn lại model mặc định.',
      });
    }

    // 6. Cache hit → trả ngay, không gọi inference
    const cached = getCachedDetections(imageId, project.default_model_id);
    if (cached) {
      console.log(`[prefill] HIT  image=${imageId} model=${project.default_model_id}`);
      const suggestions = buildSuggestions(projectId, cached.classes ?? [], cached.boxes ?? [], conf);
      return res.json({ suggestions });
    }

    // 7. Cache miss → gọi inference (chỉ HTTP mode; legacy mode không hỗ trợ)
    if (USE_LEGACY_INFER) {
      console.log(`[prefill] MISS image=${imageId} — legacy mode, không thể prefill tự động`);
      return res.status(503).json({
        error:   'INFERENCE_UNAVAILABLE',
        message: 'Prefill không khả dụng khi dùng legacy inference mode (USE_LEGACY_INFER=1).',
      });
    }

    const healthy = await checkInferenceHealth();
    if (!healthy) {
      return res.status(503).json({
        error:   'INFERENCE_UNAVAILABLE',
        message: 'Inference service chưa sẵn sàng. Thử lại sau vài giây.',
      });
    }

    const modelPath = path.join(MODEL_DIR, projectId, model.filename);
    const imagePath = path.join(UPLOAD_DIR, projectId, image.filename);

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 60 * 1000); // 60s cho 1 ảnh
    let inferData;
    try {
      const resp = await fetch(`${INFERENCE_URL}/predict`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model_path: modelPath,
          conf:       CACHE_RAW_CONF,
          images:     [{ id: imageId, path: imagePath }],
        }),
        signal: controller.signal,
      });
      clearTimeout(tid);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.error(`[prefill] inference HTTP ${resp.status}: ${errText}`);
        return res.status(503).json({ error: 'INFERENCE_ERROR', message: 'Inference service trả lỗi.' });
      }
      inferData = await resp.json();
    } catch (err) {
      clearTimeout(tid);
      const msg = err.name === 'AbortError' ? 'Timeout (60s)' : err.message;
      console.error(`[prefill] inference error: ${msg}`);
      return res.status(503).json({ error: 'INFERENCE_ERROR', message: msg });
    }

    const { classes = [], results = [], errors = [] } = inferData;

    if (errors.length > 0 && results.length === 0) {
      console.error(`[prefill] inference error for image ${imageId}:`, errors[0]?.error);
      return res.json({ suggestions: [] });
    }

    const result = results.find((r) => r.image_id === imageId);
    if (!result) return res.json({ suggestions: [] });

    // Lưu raw detections vào cache (CACHE_RAW_CONF)
    saveToCacheDetections(imageId, project.default_model_id, { classes, boxes: result.detections });
    console.log(`[prefill] MISS image=${imageId} model=${project.default_model_id} — saved to cache`);

    const suggestions = buildSuggestions(projectId, classes, result.detections, conf);
    return res.json({ suggestions });

  } catch (err) {
    console.error('[prefill] Unexpected error in GET /prefill:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/projects/:projectId/default-model ──────────────────────────────
//
// Đặt hoặc bỏ model mặc định của project (dùng cho prefill tự động).
// Body: { model_id: string }  — set model mặc định
//       { model_id: null }    — bỏ model mặc định
// Auth: reviewer, admin (annotator không được phép đổi cấu hình project).

router.patch('/default-model', requireRole('reviewer', 'admin'), (req, res) => {
  try {
    const { projectId } = req.params;
    const { model_id }  = req.body;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

    // Validate model_id nếu được truyền (không null/undefined)
    if (model_id) {
      const model = db.prepare('SELECT id FROM models WHERE id = ? AND project_id = ?')
        .get(model_id, projectId);
      if (!model) {
        return res.status(400).json({ error: 'Model không tồn tại trong project này' });
      }
    }

    db.prepare('UPDATE projects SET default_model_id = ? WHERE id = ?')
      .run(model_id || null, projectId);

    console.log(`[prefill] project=${projectId} default_model_id → ${model_id || null}`);
    res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId));
  } catch (err) {
    console.error('[prefill] PATCH /default-model error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

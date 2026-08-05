/**
 * STEP-6.3: Dataset validation endpoint.
 *
 * GET /api/projects/:projectId/validate
 *   → Kiểm tra chất lượng dataset và trả báo cáo JSON.
 *   → Response: {
 *       duplicates: [{ hash, imageIds: string[] }],
 *       invalidAnnotations: [{ id, imageId, reason }],
 *       unusedClasses: [{ id, name }]
 *     }
 *   Auth: tất cả role đã login (authRequired global đã cover ở index.js).
 *
 * Kiểm tra:
 *   (1) Duplicate ảnh: so sánh MD5 hash nội dung file, nhóm theo hash.
 *   (2) Annotation lỗi tọa độ:
 *       - w <= 0 hoặc h <= 0
 *       - x < 0 hoặc y < 0
 *       - x + w > image.width hoặc y + h > image.height
 *   (3) Class không dùng: class trong bảng `classes` mà không có annotation nào tham chiếu.
 */

import { Router } from 'express';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from '../db.js';

const router = Router({ mergeParams: true });

/**
 * Tính MD5 hash của file tại đường dẫn cho sẵn.
 * Trả empty string nếu file không đọc được.
 */
function md5File(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return createHash('md5').update(content).digest('hex');
  } catch {
    return '';
  }
}

// GET /validate — báo cáo chất lượng dataset của project
router.get('/validate', (req, res) => {
  const { projectId } = req.params;

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  // ── 1. Duplicate detection (MD5 hash) ────────────────────────────────────────
  const images = db.prepare(
    'SELECT id, filename, width, height FROM images WHERE project_id = ? ORDER BY created_at ASC'
  ).all(projectId);

  const hashMap = new Map(); // hash → imageId[]
  for (const img of images) {
    const filePath = path.join(UPLOAD_DIR, projectId, img.filename);
    const hash = md5File(filePath);
    if (!hash) continue; // bỏ qua file không đọc được
    if (!hashMap.has(hash)) hashMap.set(hash, []);
    hashMap.get(hash).push(img.id);
  }

  // Chỉ giữ nhóm có hơn 1 ảnh (thực sự trùng)
  const duplicates = [];
  for (const [hash, imageIds] of hashMap) {
    if (imageIds.length > 1) {
      duplicates.push({ hash, imageIds });
    }
  }

  // ── 2. Annotation lỗi tọa độ ────────────────────────────────────────────────
  // Join annotations với images để lấy width/height của ảnh
  const annotations = db.prepare(`
    SELECT a.id, a.image_id, a.x, a.y, a.w, a.h,
           i.width AS img_width, i.height AS img_height
    FROM annotations a
    JOIN images i ON i.id = a.image_id
    WHERE i.project_id = ?
  `).all(projectId);

  const invalidAnnotations = [];
  for (const a of annotations) {
    const reasons = [];
    if (a.w <= 0) reasons.push('w <= 0');
    if (a.h <= 0) reasons.push('h <= 0');
    if (a.x < 0) reasons.push('x < 0');
    if (a.y < 0) reasons.push('y < 0');
    // Chỉ kiểm tra vượt biên khi kích thước ảnh đã được ghi (> 0)
    if (a.img_width > 0 && (a.x + a.w) > a.img_width) {
      reasons.push(`x + w (${+(a.x + a.w).toFixed(2)}) > image.width (${a.img_width})`);
    }
    if (a.img_height > 0 && (a.y + a.h) > a.img_height) {
      reasons.push(`y + h (${+(a.y + a.h).toFixed(2)}) > image.height (${a.img_height})`);
    }
    if (reasons.length > 0) {
      invalidAnnotations.push({
        id: a.id,
        imageId: a.image_id,
        reason: reasons.join('; '),
      });
    }
  }

  // ── 3. Class không dùng ──────────────────────────────────────────────────────
  const classes = db.prepare(
    'SELECT id, name FROM classes WHERE project_id = ? ORDER BY sort_order ASC'
  ).all(projectId);

  // Tập hợp các class_id đang được dùng trong annotations của project này
  const usedClassIds = new Set(
    db.prepare(`
      SELECT DISTINCT a.class_id
      FROM annotations a
      JOIN images i ON i.id = a.image_id
      WHERE i.project_id = ?
    `).all(projectId).map((r) => r.class_id)
  );

  const unusedClasses = classes.filter((c) => !usedClassIds.has(c.id));

  res.json({
    duplicates,
    invalidAnnotations,
    unusedClasses,
  });
});

export default router;

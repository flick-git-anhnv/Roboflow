/**
 * Review workflow routes — AD-A5 Row 8, STEP-2.3.
 * Mounted at: /api/images/:imageId  (mergeParams: true)
 *
 * Endpoints:
 *   POST /submit-review  annotator/admin → draft|rejected → in_review
 *   POST /approve        reviewer/admin  → in_review → approved
 *   POST /reject         reviewer/admin  → in_review → rejected  (body: { comment })
 *
 * review_status lifecycle (m004_add_review_status, db.js):
 *   'draft' → 'in_review' → 'approved'
 *                        ↘ 'rejected' → submit lại → 'in_review'
 *
 * Lưu ý STEP-3.5: khi hoàn thành STEP-3.5 (completed_at/completed_by),
 * submit-review nên kiểm tra completed_at IS NOT NULL thay vì status='labeled'.
 * Hiện tại cho phép submit bất kỳ ảnh nào ở draft/rejected để không block Phase 2.
 */

import { Router } from 'express';
import { db } from '../db.js';
import { requireRole } from '../middleware/roles.js';

const router = Router({ mergeParams: true });

/** Lấy ảnh theo id — trả null nếu không tìm thấy. */
function getImage(imageId) {
  return db.prepare('SELECT * FROM images WHERE id = ?').get(imageId);
}

// ── POST /api/images/:imageId/submit-review ───────────────────────────────────
// Ai được gọi: annotator, admin  (reviewer KHÔNG được submit — AD-A5 Row 8)
// Chuyển review_status: 'draft' | 'rejected' → 'in_review'
router.post('/submit-review', requireRole('annotator', 'admin'), (req, res) => {
  const { imageId } = req.params;
  const image = getImage(imageId);
  if (!image) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  if (!['draft', 'rejected'].includes(image.review_status)) {
    return res.status(409).json({
      error: 'REVIEW_STATUS_CONFLICT',
      detail: `Ảnh đang ở trạng thái '${image.review_status}', không thể submit để review.`,
      current: image.review_status,
    });
  }

  db.prepare(
    "UPDATE images SET review_status = 'in_review', review_comment = NULL WHERE id = ?"
  ).run(imageId);

  res.json(db.prepare('SELECT * FROM images WHERE id = ?').get(imageId));
});

// ── POST /api/images/:imageId/approve ─────────────────────────────────────────
// Ai được gọi: reviewer, admin  (annotator → 403 từ requireRole)
// Chuyển review_status: 'in_review' → 'approved'
router.post('/approve', requireRole('reviewer', 'admin'), (req, res) => {
  const { imageId } = req.params;
  const image = getImage(imageId);
  if (!image) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  if (image.review_status !== 'in_review') {
    return res.status(409).json({
      error: 'REVIEW_STATUS_CONFLICT',
      detail: `Ảnh phải ở trạng thái 'in_review' để approve. Hiện tại: '${image.review_status}'.`,
      current: image.review_status,
    });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE images
    SET review_status = 'approved',
        review_comment = NULL,
        reviewed_by = ?,
        reviewed_at = ?
    WHERE id = ?
  `).run(req.user.id, now, imageId);

  res.json(db.prepare('SELECT * FROM images WHERE id = ?').get(imageId));
});

// ── POST /api/images/:imageId/reject ──────────────────────────────────────────
// Ai được gọi: reviewer, admin  (annotator → 403 từ requireRole)
// body: { comment?: string }
// Chuyển review_status: 'in_review' → 'rejected'; lưu review_comment
router.post('/reject', requireRole('reviewer', 'admin'), (req, res) => {
  const { imageId } = req.params;
  const image = getImage(imageId);
  if (!image) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  if (image.review_status !== 'in_review') {
    return res.status(409).json({
      error: 'REVIEW_STATUS_CONFLICT',
      detail: `Ảnh phải ở trạng thái 'in_review' để reject. Hiện tại: '${image.review_status}'.`,
      current: image.review_status,
    });
  }

  // comment là tùy chọn — nên có nhưng không bắt buộc để tránh block workflow
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE images
    SET review_status = 'rejected',
        review_comment = ?,
        reviewed_by = ?,
        reviewed_at = ?
    WHERE id = ?
  `).run(comment || null, req.user.id, now, imageId);

  res.json(db.prepare('SELECT * FROM images WHERE id = ?').get(imageId));
});

export default router;

/**
 * Activity log routes — STEP-3.3.
 * Mounted at: /api/projects/:projectId/activity  (mergeParams: true)
 *
 * Endpoint:
 *   GET /  → trả danh sách activity_log của project, JOIN users để lấy actor_name/actor_color.
 *            Phân trang đơn giản: limit (mặc định 50, tối đa 100) + offset.
 *            Tất cả role đã login đều xem được — không cần role guard (giống Row 1 GET resources).
 *
 * Các action được ghi vào bảng này (bởi routes/images.js, routes/export.js):
 *   image_upload   — upload ảnh mới (detail: { count, names })
 *   image_delete   — xoá ảnh (detail: { image_id, filename })
 *   split_change   — đổi split 1 ảnh (detail: { image_id, from, to })
 *   export         — export dataset (detail: { format, count })
 */

import { Router } from 'express';
import { db } from '../db.js';

const router = Router({ mergeParams: true });

// GET /api/projects/:projectId/activity
router.get('/', (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = Math.max(0, parseInt(req.query.offset) || 0);

  const logs = db.prepare(`
    SELECT al.id,
           al.project_id,
           al.actor_id,
           al.action,
           al.detail,
           al.created_at,
           u.display_name AS actor_name,
           u.color        AS actor_color
    FROM   activity_log al
    LEFT JOIN users u ON u.id = al.actor_id
    WHERE  al.project_id = ?
    ORDER  BY al.created_at DESC
    LIMIT  ? OFFSET ?
  `).all(req.params.projectId, limit, offset);

  res.json(logs.map((l) => ({
    ...l,
    detail: l.detail ? JSON.parse(l.detail) : null,
  })));
});

export default router;

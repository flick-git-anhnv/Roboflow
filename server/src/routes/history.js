/**
 * Annotation History routes (STEP-3.2)
 * Mounted at: /api/images/:imageId  (mergeParams: true)
 *
 * GET  /history                      — list versions (no snapshot, all authenticated)
 * POST /history/:version/revert      — revert to version (reviewer/admin only — AD-A5 Row 7)
 */
import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db, pruneAnnotationHistory } from '../db.js';
import { requireRole } from '../middleware/roles.js';

const router = Router({ mergeParams: true });

function parseAnnotationRow(row) {
  return { ...row, points: row.points ? JSON.parse(row.points) : null };
}

// ── GET /api/images/:imageId/history ─────────────────────────────────────────
// Trả danh sách history entries — KHÔNG kèm snapshot (nhẹ, dùng để hiển thị list)
// Tất cả role đã xác thực đều xem được (annotator cần xem lịch sử của ảnh mình làm)
router.get('/history', (req, res) => {
  const { imageId } = req.params;
  const image = db.prepare('SELECT id FROM images WHERE id = ?').get(imageId);
  if (!image) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  const entries = db.prepare(`
    SELECT h.id, h.version, h.actor_id, h.created_at,
           u.display_name AS actor_name,
           u.username     AS actor_username
    FROM annotation_history h
    LEFT JOIN users u ON u.id = h.actor_id
    WHERE h.image_id = ?
    ORDER BY h.version DESC
  `).all(imageId);

  res.json(entries);
});

// ── POST /api/images/:imageId/history/:version/revert ────────────────────────
// Lấy snapshot của version chỉ định, ghi đè annotations hiện tại.
// Sau revert: ghi thêm 1 entry history mới (tăng version) để audit trail liên tục.
// Role guard: chỉ reviewer, admin — annotator → 403 (AD-A5 Row 7)
router.post('/history/:version/revert', requireRole('reviewer', 'admin'), (req, res) => {
  const { imageId, version } = req.params;
  const versionNum = parseInt(version, 10);

  if (!Number.isFinite(versionNum) || versionNum < 1) {
    return res.status(400).json({ error: 'version phải là số nguyên dương' });
  }

  const image = db.prepare('SELECT id FROM images WHERE id = ?').get(imageId);
  if (!image) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  const historyEntry = db.prepare(
    'SELECT * FROM annotation_history WHERE image_id = ? AND version = ?'
  ).get(imageId, versionNum);

  if (!historyEntry) {
    return res.status(404).json({ error: `Không tìm thấy version ${versionNum}` });
  }

  // Parse snapshot (SNAPSHOT strategy: JSON mảng annotations)
  let snapshotBoxes;
  try {
    snapshotBoxes = JSON.parse(historyEntry.snapshot);
    if (!Array.isArray(snapshotBoxes)) snapshotBoxes = [];
  } catch {
    return res.status(500).json({ error: 'Snapshot data bị lỗi — không thể revert' });
  }

  // Áp dụng revert trong 1 transaction + ghi 1 history entry mới cho lần revert này
  const tx = db.transaction(() => {
    // Xoá toàn bộ annotations hiện tại
    db.prepare('DELETE FROM annotations WHERE image_id = ?').run(imageId);

    // Insert lại từ snapshot
    const insertAnnot = db.prepare(`
      INSERT INTO annotations (id, image_id, class_id, x, y, w, h, type, points)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of snapshotBoxes) {
      const type = b.type === 'quad' ? 'quad' : 'bbox';
      const points = type === 'quad' && Array.isArray(b.points) ? JSON.stringify(b.points) : null;
      insertAnnot.run(nanoid(), imageId, b.class_id, b.x, b.y, b.w, b.h, type, points);
    }

    // Cập nhật image status theo nội dung đã revert
    db.prepare("UPDATE images SET status = ? WHERE id = ?")
      .run(snapshotBoxes.length > 0 ? 'labeled' : 'unlabeled', imageId);

    // Ghi history entry mới cho hành động revert (audit trail)
    const { max_v } = db.prepare(
      'SELECT COALESCE(MAX(version), 0) AS max_v FROM annotation_history WHERE image_id = ?'
    ).get(imageId);
    const newVersion = max_v + 1;

    db.prepare(`
      INSERT INTO annotation_history (image_id, version, snapshot, actor_id)
      VALUES (?, ?, ?, ?)
    `).run(imageId, newVersion, JSON.stringify(snapshotBoxes), req.user?.id ?? null);
  });
  tx();

  // Prune ngoài transaction
  pruneAnnotationHistory(imageId);

  const annotations = db.prepare('SELECT * FROM annotations WHERE image_id = ?')
    .all(imageId)
    .map(parseAnnotationRow);

  res.json({ reverted_to_version: versionNum, annotations });
});

export default router;

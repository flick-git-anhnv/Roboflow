import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db, pruneAnnotationHistory } from '../db.js';

const router = Router({ mergeParams: true });

function parseAnnotationRow(row) {
  return { ...row, points: row.points ? JSON.parse(row.points) : null };
}

// Replace all annotations for an image in one call (autosave from the canvas editor)
// STEP-3.2: Mỗi save thành công → INSERT 1 snapshot vào annotation_history, gọi prune.
// STEP-3.4: Optimistic locking — client gửi expectedVersion, server kiểm tra trước khi save.
//   - "version của ảnh" = MAX(version) trong annotation_history của ảnh đó (per-save version).
//   - annotations.version (per-row) KHÔNG dùng cho locking — chỉ là placeholder migration 3.1.
//   - Nếu expectedVersion không gửi → bỏ qua kiểm tra (backward compat với code cũ).
router.put('/', (req, res) => {
  const { imageId } = req.params;
  const image = db.prepare('SELECT * FROM images WHERE id = ?').get(imageId);
  if (!image) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  const boxes = Array.isArray(req.body.annotations) ? req.body.annotations : [];

  // STEP-3.4: Đọc version hiện tại từ annotation_history TRƯỚC transaction
  const { currentVersion } = db.prepare(
    'SELECT COALESCE(MAX(version), 0) AS currentVersion FROM annotation_history WHERE image_id = ?'
  ).get(imageId);

  // Kiểm tra optimistic lock: chỉ khi client gửi expectedVersion
  if (req.body.expectedVersion != null) {
    const expectedVersion = parseInt(req.body.expectedVersion, 10);
    if (!Number.isFinite(expectedVersion) || expectedVersion !== currentVersion) {
      return res.status(409).json({
        error: 'ANNOTATION_CONFLICT',
        serverVersion: currentVersion,
        message: 'Ảnh này đã được chỉnh sửa bởi session khác. Vui lòng tải lại để lấy bản mới nhất.',
      });
    }
  }

  const nextVersion = currentVersion + 1;

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM annotations WHERE image_id = ?').run(imageId);
    const insert = db.prepare(`
      INSERT INTO annotations (id, image_id, class_id, x, y, w, h, type, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of boxes) {
      const type = b.type === 'quad' ? 'quad' : 'bbox';
      const points = type === 'quad' && Array.isArray(b.points) ? JSON.stringify(b.points) : null;
      insert.run(nanoid(), imageId, b.class_id, b.x, b.y, b.w, b.h, type, points);
    }
    db.prepare("UPDATE images SET status = ? WHERE id = ?")
      .run(boxes.length > 0 ? 'labeled' : 'unlabeled', imageId);

    // Ghi SNAPSHOT toàn bộ annotations mới vào annotation_history (ADR AD-5)
    db.prepare(`
      INSERT INTO annotation_history (image_id, version, snapshot, actor_id)
      VALUES (?, ?, ?, ?)
    `).run(imageId, nextVersion, JSON.stringify(boxes), req.user?.id ?? null);
  });
  tx();

  // Prune giữ tối đa 200 version/ảnh — gọi ngoài transaction (cleanup bất đồng bộ-safe)
  pruneAnnotationHistory(imageId);

  const annotations = db.prepare('SELECT * FROM annotations WHERE image_id = ?').all(imageId).map(parseAnnotationRow);
  // STEP-3.4: Trả annotationVersion để client cập nhật expectedVersion cho lần save tiếp theo
  res.json({ annotations, annotationVersion: nextVersion });
});

export default router;

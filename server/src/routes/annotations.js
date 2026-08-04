import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

const router = Router({ mergeParams: true });

function parseAnnotationRow(row) {
  return { ...row, points: row.points ? JSON.parse(row.points) : null };
}

// Replace all annotations for an image in one call (autosave from the canvas editor)
router.put('/', (req, res) => {
  const { imageId } = req.params;
  const image = db.prepare('SELECT * FROM images WHERE id = ?').get(imageId);
  if (!image) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  const boxes = Array.isArray(req.body.annotations) ? req.body.annotations : [];

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
  });
  tx();

  const annotations = db.prepare('SELECT * FROM annotations WHERE image_id = ?').all(imageId).map(parseAnnotationRow);
  res.json(annotations);
});

export default router;

import { Router } from 'express';
import { db } from '../db.js';

const router = Router({ mergeParams: true });

router.get('/', (req, res) => {
  const { projectId } = req.params;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  const classes = db.prepare('SELECT * FROM classes WHERE project_id = ? ORDER BY sort_order ASC').all(projectId);
  const images = db.prepare('SELECT id, split, status, completed_at FROM images WHERE project_id = ?').all(projectId);

  const countByClass = db.prepare(`
    SELECT a.class_id AS class_id, COUNT(*) AS count
    FROM annotations a
    JOIN images i ON i.id = a.image_id
    WHERE i.project_id = ?
    GROUP BY a.class_id
  `).all(projectId);
  const countMap = new Map(countByClass.map((r) => [r.class_id, r.count]));

  const perClass = classes.map((c) => ({
    class_id: c.id,
    name: c.name,
    color: c.color,
    count: countMap.get(c.id) || 0,
  }));

  const totalAnnotations = perClass.reduce((sum, c) => sum + c.count, 0);
  const completedImages = images.filter((i) => i.completed_at != null).length;
  const labeledImages = images.filter((i) => i.status === 'labeled').length;
  const bySplit = { train: 0, valid: 0, test: 0 };
  for (const img of images) {
    const s = ['train', 'valid', 'test'].includes(img.split) ? img.split : 'train';
    bySplit[s]++;
  }

  res.json({
    totalImages: images.length,
    completedImages,
    labeledImages,
    unlabeledImages: images.length - labeledImages,
    totalAnnotations,
    bySplit,
    perClass,
  });
});

export default router;

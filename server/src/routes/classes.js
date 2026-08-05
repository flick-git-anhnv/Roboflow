import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

const router = Router({ mergeParams: true });

function normalizeHotkey(hotkey) {
  if (typeof hotkey !== 'string') return null;
  const trimmed = hotkey.trim().slice(0, 2);
  return trimmed || null;
}

router.get('/', (req, res) => {
  const classes = db.prepare('SELECT * FROM classes WHERE project_id = ? ORDER BY sort_order ASC')
    .all(req.params.projectId);
  res.json(classes);
});

router.post('/', (req, res) => {
  const { name, color, hotkey } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tên nhãn không được để trống' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM classes WHERE project_id = ?')
    .get(req.params.projectId).m;
  const id = nanoid();
  db.prepare('INSERT INTO classes (id, project_id, name, color, sort_order, hotkey) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.projectId, name.trim(), color || '#F05922', maxOrder + 1, normalizeHotkey(hotkey));
  res.status(201).json(db.prepare('SELECT * FROM classes WHERE id = ?').get(id));
});

router.patch('/:classId', (req, res) => {
  const existing = db.prepare('SELECT * FROM classes WHERE id = ? AND project_id = ?')
    .get(req.params.classId, req.params.projectId);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy nhãn' });
  const { name, color, hotkey } = req.body;
  db.prepare('UPDATE classes SET name = ?, color = ?, hotkey = ? WHERE id = ?')
    .run(
      name ?? existing.name,
      color ?? existing.color,
      hotkey === undefined ? existing.hotkey : normalizeHotkey(hotkey),
      req.params.classId
    );
  res.json(db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.classId));
});

router.delete('/:classId', (req, res) => {
  db.prepare('DELETE FROM classes WHERE id = ? AND project_id = ?')
    .run(req.params.classId, req.params.projectId);
  res.status(204).end();
});

export default router;

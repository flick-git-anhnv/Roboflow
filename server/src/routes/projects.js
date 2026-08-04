import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

const router = Router();

const DEFAULT_COLORS = ['#F05922', '#251C53', '#4A3F8C', '#2E9E6C', '#C0392B', '#1B9CFC', '#9B59B6', '#E7A83E'];

router.get('/', (req, res) => {
  const projects = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM images i WHERE i.project_id = p.id) AS image_count,
      (SELECT COUNT(*) FROM images i WHERE i.project_id = p.id AND i.status = 'labeled') AS labeled_count,
      (SELECT COUNT(*) FROM classes c WHERE c.project_id = p.id) AS class_count
    FROM projects p ORDER BY p.created_at DESC
  `).all();
  res.json(projects);
});

router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tên project không được để trống' });
  const id = nanoid();
  db.prepare('INSERT INTO projects (id, name, description) VALUES (?, ?, ?)').run(id, name.trim(), description || '');
  DEFAULT_COLORS.slice(0, 2).forEach((color, i) => {
    db.prepare('INSERT INTO classes (id, project_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(nanoid(), id, i === 0 ? 'object' : 'defect', color, i);
  });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(project);
});

router.get('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });
  res.json(project);
});

router.patch('/:id', (req, res) => {
  const { name, description } = req.body;
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy project' });
  db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?')
    .run(name ?? existing.name, description ?? existing.description, req.params.id);
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;

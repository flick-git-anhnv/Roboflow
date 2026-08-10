import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { requireRole } from '../middleware/roles.js';
import { checkProjectAssignment } from '../middleware/projectAccess.js';

const router = Router();

const DEFAULT_COLORS = ['#F05922', '#251C53', '#4A3F8C', '#2E9E6C', '#C0392B', '#1B9CFC', '#9B59B6', '#E7A83E'];

router.get('/', (req, res) => {
  const user = req.user;
  let query = `
    SELECT p.*,
      (SELECT COUNT(*) FROM images i WHERE i.project_id = p.id) AS image_count,
      (SELECT COUNT(*) FROM images i WHERE i.project_id = p.id AND (i.status = 'labeled' OR i.completed_at IS NOT NULL)) AS labeled_count,
      (SELECT COUNT(*) FROM images i WHERE i.project_id = p.id AND i.completed_at IS NOT NULL) AS completed_count,
      (SELECT COUNT(*) FROM classes c WHERE c.project_id = p.id) AS class_count
    FROM projects p
  `;
  const params = [];

  if (user && (user.role === 'annotator' || user.role === 'label')) {
    query += ` JOIN project_assignments pa ON pa.project_id = p.id WHERE pa.user_id = ? `;
    params.push(user.id);
  }

  query += ` ORDER BY p.created_at DESC `;

  const projects = db.prepare(query).all(...params);

  // Lấy members cho tất cả projects trong 1 query (không N+1)
  const projectIds = projects.map(p => p.id);
  let members = [];
  if (projectIds.length > 0) {
    const placeholders = projectIds.map(() => '?').join(',');
    members = db.prepare(`
      SELECT
        pa.project_id,
        u.id AS user_id,
        u.display_name,
        u.username,
        u.color,
        u.role,
        (SELECT COUNT(*) FROM images i WHERE i.project_id = pa.project_id AND i.assigned_to = u.id) AS assigned_count,
        (SELECT COUNT(*) FROM images i WHERE i.project_id = pa.project_id AND i.assigned_to = u.id AND (i.status = 'labeled' OR i.completed_at IS NOT NULL)) AS labeled_count,
        (SELECT COUNT(*) FROM images i WHERE i.project_id = pa.project_id AND i.assigned_to = u.id AND i.completed_at IS NOT NULL) AS done_count
      FROM project_assignments pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.project_id IN (${placeholders}) AND u.is_active = 1 AND pa.percent > 0
      ORDER BY pa.percent DESC, u.display_name ASC
    `).all(...projectIds);
  }

  // Group members by project_id
  const membersByProject = {};
  for (const m of members) {
    if (!membersByProject[m.project_id]) membersByProject[m.project_id] = [];
    membersByProject[m.project_id].push({
      user_id: m.user_id,
      display_name: m.display_name,
      username: m.username,
      color: m.color,
      role: m.role,
      assigned_count: m.assigned_count,
      labeled_count: m.labeled_count,
      done_count: m.done_count,
    });
  }

  const result = projects.map(p => ({
    ...p,
    members: membersByProject[p.id] || [],
  }));

  res.json(result);
});

router.post('/', (req, res) => {
  const { name, description, status, label_type } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tên project không được để trống' });
  const VALID_STATUSES = ['planning', 'active', 'done'];
  const projectStatus = status && VALID_STATUSES.includes(status) ? status : 'active';
  const VALID_LABEL_TYPES = ['bbox', 'quad', 'classify', 'text_rec'];
  const projectLabelType = label_type && VALID_LABEL_TYPES.includes(label_type) ? label_type : 'bbox';
  const id = nanoid();
  db.prepare('INSERT INTO projects (id, name, description, status, label_type) VALUES (?, ?, ?, ?, ?)').run(id, name.trim(), description || '', projectStatus, projectLabelType);
  DEFAULT_COLORS.slice(0, 2).forEach((color, i) => {
    db.prepare('INSERT INTO classes (id, project_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(nanoid(), id, i === 0 ? 'object' : 'defect', color, i);
  });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(project);
});

router.get('/:id', checkProjectAssignment, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });
  res.json(project);
});

router.patch('/:id', checkProjectAssignment, (req, res) => {
  console.log('[projectsRouter] PATCH projects/:id called. ID:', req.params.id, 'body:', req.body);
  const { name, description, status, label_type } = req.body;
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy project' });
  const VALID_STATUSES = ['planning', 'active', 'done'];
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Trạng thái không hợp lệ. Chỉ nhận: ${VALID_STATUSES.join(', ')}` });
  }
  const VALID_LABEL_TYPES = ['bbox', 'quad', 'classify', 'text_rec'];
  if (label_type !== undefined && !VALID_LABEL_TYPES.includes(label_type)) {
    return res.status(400).json({ error: `Loại gán nhãn không hợp lệ. Chỉ nhận: ${VALID_LABEL_TYPES.join(', ')}` });
  }
  db.prepare('UPDATE projects SET name = ?, description = ?, status = ?, label_type = ? WHERE id = ?')
    .run(
      name ?? existing.name,
      description ?? existing.description,
      status ?? existing.status ?? 'active',
      label_type ?? existing.label_type ?? 'bbox',
      req.params.id
    );
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

// AD-A5: Xoá project → admin only
router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;

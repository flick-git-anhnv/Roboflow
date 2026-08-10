import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { db, MODEL_DIR } from '../db.js';
import { requireRole } from '../middleware/roles.js';

const router = Router({ mergeParams: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(MODEL_DIR, req.params.projectId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${nanoid()}${ext}`);
    },
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
  fileFilter: (req, file, cb) => {
    const ok = /\.(pt|onnx)$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ chấp nhận file model định dạng .pt hoặc .onnx'), ok);
  },
});

router.get('/', (req, res) => {
  const models = db.prepare('SELECT * FROM models WHERE project_id = ? ORDER BY created_at DESC')
    .all(req.params.projectId);
  res.json(models);
});

// AD-A5: CRUD models (upload/delete) → reviewer + admin only
router.post('/upload', requireRole('reviewer', 'admin'), upload.single('model'), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });
  if (!req.file) return res.status(400).json({ error: 'Không nhận được file model' });

  const id = nanoid();
  db.prepare('INSERT INTO models (id, project_id, filename, original_name) VALUES (?, ?, ?, ?)')
    .run(id, req.params.projectId, req.file.filename, req.file.originalname);
  res.status(201).json(db.prepare('SELECT * FROM models WHERE id = ?').get(id));
});

// PATCH /:modelId — cập nhật metadata model (notes, map_score, version_label)
// Role guard: reviewer + admin (same as upload/delete — AD-A5)
router.patch('/:modelId', requireRole('reviewer', 'admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM models WHERE id = ? AND project_id = ?')
    .get(req.params.modelId, req.params.projectId);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy model' });

  const { notes, map_score, version_label } = req.body;

  // Validate map_score nếu được cung cấp (phải là số [0, 1] hoặc null)
  if (map_score !== undefined && map_score !== null) {
    const val = Number(map_score);
    if (isNaN(val) || val < 0 || val > 1) {
      return res.status(400).json({ error: 'map_score phải là số thực trong khoảng [0, 1]' });
    }
  }

  // Chỉ cập nhật field được cung cấp (PATCH semantics — không ghi đè field không có trong body)
  const updates = {};
  if (notes        !== undefined) updates.notes         = notes ?? null;
  if (map_score    !== undefined) updates.map_score     = map_score !== null ? Number(map_score) : null;
  if (version_label !== undefined) updates.version_label = version_label ?? null;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Cần ít nhất 1 field: notes, map_score, hoặc version_label' });
  }

  const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE models SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), req.params.modelId);

  res.json(db.prepare('SELECT * FROM models WHERE id = ?').get(req.params.modelId));
});

router.delete('/:modelId', requireRole('reviewer', 'admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM models WHERE id = ? AND project_id = ?')
    .get(req.params.modelId, req.params.projectId);
  if (existing) {
    fs.unlink(path.join(MODEL_DIR, req.params.projectId, existing.filename), () => {});
    db.prepare('DELETE FROM models WHERE id = ?').run(req.params.modelId);
  }
  res.status(204).end();
});

export default router;

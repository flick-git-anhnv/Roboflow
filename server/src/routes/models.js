import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { db, MODEL_DIR } from '../db.js';

const router = Router({ mergeParams: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(MODEL_DIR, req.params.projectId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${nanoid()}.pt`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
  fileFilter: (req, file, cb) => {
    const ok = /\.pt$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ chấp nhận file model YOLO định dạng .pt'), ok);
  },
});

router.get('/', (req, res) => {
  const models = db.prepare('SELECT * FROM models WHERE project_id = ? ORDER BY created_at DESC')
    .all(req.params.projectId);
  res.json(models);
});

router.post('/upload', upload.single('model'), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });
  if (!req.file) return res.status(400).json({ error: 'Không nhận được file model' });

  const id = nanoid();
  db.prepare('INSERT INTO models (id, project_id, filename, original_name) VALUES (?, ?, ?, ?)')
    .run(id, req.params.projectId, req.file.filename, req.file.originalname);
  res.status(201).json(db.prepare('SELECT * FROM models WHERE id = ?').get(id));
});

router.delete('/:modelId', (req, res) => {
  const existing = db.prepare('SELECT * FROM models WHERE id = ? AND project_id = ?')
    .get(req.params.modelId, req.params.projectId);
  if (existing) {
    fs.unlink(path.join(MODEL_DIR, req.params.projectId, existing.filename), () => {});
    db.prepare('DELETE FROM models WHERE id = ?').run(req.params.modelId);
  }
  res.status(204).end();
});

export default router;

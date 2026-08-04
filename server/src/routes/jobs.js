import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// ─── Normalize DB row → API response shape ────────────────────────────────────

function normalizeJob(j) {
  return {
    id: j.id,
    projectId: j.project_id,
    status: j.status,
    total: j.total_images,
    done: j.processed,
    created: j.created_annotations,
    failed: j.failed,
    modelId: j.model_id,
    error: j.error_msg || null,
    unmatchedClasses: JSON.parse(j.unmatched_classes || '[]'),
    createdAt: j.created_at,
    updatedAt: j.updated_at,
  };
}

// ─── GET /api/jobs?projectId=<id> ────────────────────────────────────────────

router.get('/', (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }
  const rows = db
    .prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId);
  res.json(rows.map(normalizeJob));
});

// ─── GET /api/jobs/:id ────────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy job' });
  res.json(normalizeJob(row));
});

// ─── DELETE /api/jobs/:id ─────────────────────────────────────────────────────

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy job' });
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;

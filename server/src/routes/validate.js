/**
 * STEP-6.3 & R4: Dataset validation endpoint with cached hashes & instant SQL query.
 *
 * GET /api/projects/:projectId/validate
 *   → Response: {
 *       duplicates: [{ hash, imageIds: string[] }],
 *       invalidAnnotations: [{ id, imageId, reason }],
 *       unusedClasses: [{ id, name }]
 *     }
 */

import { Router } from 'express';
import path from 'node:path';
import { db, UPLOAD_DIR } from '../db.js';
import { backfillMissingHashes } from '../services/hashService.js';

const router = Router({ mergeParams: true });

// GET /validate — báo cáo chất lượng dataset của project
router.get('/validate', (req, res) => {
  const { projectId } = req.params;

  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

    // ── 1. Non-blocking async backfill missing hashes ─────────────────────────────
    const unhashedCountObj = db.prepare("SELECT COUNT(*) AS c FROM images WHERE project_id = ? AND (file_hash IS NULL OR file_hash = '')").get(projectId);
    const hasPendingHashes = unhashedCountObj.c > 0;

    if (hasPendingHashes) {
      setImmediate(() => {
        backfillMissingHashes(db, projectId).catch((e) => {
          console.error('[validate] Async hash backfill error:', e.message);
        });
      });
    }

    // ── 2. Duplicate detection (Instant SQL Hash Aggregation) ─────────────────────
    const duplicateGroups = db.prepare(`
      SELECT file_hash, 
             GROUP_CONCAT(id, '||') AS image_ids_str,
             GROUP_CONCAT(filename, '||') AS filenames_str,
             COUNT(*) AS count
      FROM images
      WHERE project_id = ? AND file_hash IS NOT NULL AND file_hash != ''
      GROUP BY file_hash
      HAVING count > 1
    `).all(projectId);

    const duplicates = duplicateGroups.map((g) => {
      const ids = g.image_ids_str ? g.image_ids_str.split('||') : [];
      const fnames = g.filenames_str ? g.filenames_str.split('||') : [];
      const images = ids.map((id, i) => ({ id, filename: fnames[i] }));
      return {
        hash: g.file_hash,
        images,
        imageIds: ids,
      };
    });

    // ── 3. Annotation lỗi tọa độ ────────────────────────────────────────────────
    const annotations = db.prepare(`
      SELECT a.id, a.image_id, a.x, a.y, a.w, a.h, a.type,
             i.width AS img_width, i.height AS img_height
      FROM annotations a
      JOIN images i ON i.id = a.image_id
      WHERE i.project_id = ?
    `).all(projectId);

    const invalidAnnotations = [];
    for (const a of annotations) {
      if (a.type === 'text_rec') continue; // Skip coordinate checking for OCR-level text_rec boxes which might cover 0,0,0,0
      
      const reasons = [];
      if (a.w <= 0) reasons.push('w <= 0');
      if (a.h <= 0) reasons.push('h <= 0');
      if (a.x < 0) reasons.push('x < 0');
      if (a.y < 0) reasons.push('y < 0');
      if (a.img_width > 0 && (a.x + a.w) > a.img_width) {
        reasons.push(`x + w (${+(a.x + a.w).toFixed(2)}) > image.width (${a.img_width})`);
      }
      if (a.img_height > 0 && (a.y + a.h) > a.img_height) {
        reasons.push(`y + h (${+(a.y + a.h).toFixed(2)}) > image.height (${a.img_height})`);
      }
      if (reasons.length > 0) {
        invalidAnnotations.push({
          id: a.id,
          imageId: a.image_id,
          reason: reasons.join('; '),
        });
      }
    }

    // ── 4. Class không dùng ──────────────────────────────────────────────────────
    const classes = db.prepare(
      'SELECT id, name FROM classes WHERE project_id = ? ORDER BY sort_order ASC'
    ).all(projectId);

    const usedClassIds = new Set(
      db.prepare(`
        SELECT DISTINCT a.class_id
        FROM annotations a
        JOIN images i ON i.id = a.image_id
        WHERE i.project_id = ?
      `).all(projectId).map((r) => r.class_id)
    );

    const unusedClasses = classes.filter((c) => !usedClassIds.has(c.id));

    return res.json({
      duplicates,
      invalidAnnotations,
      unusedClasses,
      isHashing: hasPendingHashes
    });
  } catch (err) {
    console.error('[validate error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

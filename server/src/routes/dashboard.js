import { Router } from 'express';
import { db } from '../db.js';
import { checkProjectAssignment } from '../middleware/projectAccess.js';

const router = Router({ mergeParams: true });

// ── 1. GET /api/dashboard/overview ─────────────────────────────────────────
router.get('/overview', (req, res) => {
  try {
    const user = req.user;
    let totalProjects, totalImages, totalAnnotations, totalUsers, completedImages, recentActivity;

    if (user && (user.role === 'annotator' || user.role === 'label')) {
      const userId = user.id;
      totalProjects = db.prepare('SELECT COUNT(*) AS n FROM project_assignments WHERE user_id = ?').get(userId).n;
      totalImages = db.prepare(`
        SELECT COUNT(*) AS n FROM images i
        JOIN project_assignments pa ON pa.project_id = i.project_id
        WHERE pa.user_id = ?
      `).get(userId).n;
      totalAnnotations = db.prepare(`
        SELECT COUNT(*) AS n FROM annotations a
        JOIN images i ON i.id = a.image_id
        JOIN project_assignments pa ON pa.project_id = i.project_id
        WHERE pa.user_id = ?
      `).get(userId).n;
      totalUsers = db.prepare(`
        SELECT COUNT(DISTINCT user_id) AS n FROM project_assignments
        WHERE project_id IN (SELECT project_id FROM project_assignments WHERE user_id = ?)
      `).get(userId).n;
      completedImages = db.prepare(`
        SELECT COUNT(*) AS n FROM images i
        JOIN project_assignments pa ON pa.project_id = i.project_id
        WHERE pa.user_id = ? AND (i.completed_at IS NOT NULL OR i.status = 'labeled')
      `).get(userId).n;

      recentActivity = db.prepare(`
        SELECT a.id, a.project_id, a.actor_id, u.display_name AS actor_name, a.action, a.detail, a.created_at
        FROM activity_log a
        JOIN project_assignments pa ON pa.project_id = a.project_id
        LEFT JOIN users u ON u.id = a.actor_id
        WHERE pa.user_id = ?
        ORDER BY a.created_at DESC
        LIMIT 10
      `).all(userId).map((r) => {
        let parsedDetail = null;
        if (r.detail) {
          try { parsedDetail = JSON.parse(r.detail); } catch (_) { parsedDetail = r.detail; }
        }
        return {
          ...r,
          detail: parsedDetail,
        };
      });
    } else {
      totalProjects = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
      totalImages = db.prepare('SELECT COUNT(*) AS n FROM images').get().n;
      totalAnnotations = db.prepare('SELECT COUNT(*) AS n FROM annotations').get().n;
      totalUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
      completedImages = db.prepare(
        "SELECT COUNT(*) AS n FROM images WHERE completed_at IS NOT NULL OR status = 'labeled'"
      ).get().n;

      recentActivity = db.prepare(`
        SELECT a.id, a.project_id, a.actor_id, u.display_name AS actor_name, a.action, a.detail, a.created_at
        FROM activity_log a
        LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC
        LIMIT 10
      `).all().map((r) => {
        let parsedDetail = null;
        if (r.detail) {
          try { parsedDetail = JSON.parse(r.detail); } catch (_) { parsedDetail = r.detail; }
        }
        return {
          ...r,
          detail: parsedDetail,
        };
      });
    }

    const globalCompletionPercent = totalImages > 0
      ? Math.round((completedImages / totalImages) * 1000) / 10
      : 0;

    res.json({
      totalProjects,
      totalImages,
      totalAnnotations,
      totalUsers,
      globalCompletionPercent,
      recentActivity,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 2. GET /api/projects/:projectId/dashboard ──────────────────────────────
router.get('/:projectId/dashboard', checkProjectAssignment, (req, res) => {
  const { projectId } = req.params;
  const completedOnly = req.query.completedOnly === 'true';
  const imageFilter = completedOnly ? " AND i.completed_at IS NOT NULL" : "";
  const baseImageFilter = completedOnly ? " AND completed_at IS NOT NULL" : "";
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

    const totalImages = db.prepare('SELECT COUNT(*) AS n FROM images WHERE project_id = ?').get(projectId).n;
    const labeledImages = db.prepare("SELECT COUNT(*) AS n FROM images WHERE project_id = ? AND (status = 'labeled' OR completed_at IS NOT NULL)").get(projectId).n;
    const completedImages = db.prepare('SELECT COUNT(*) AS n FROM images WHERE project_id = ? AND completed_at IS NOT NULL').get(projectId).n;
    const unlabeledImages = Math.max(0, totalImages - labeledImages);

    const totalAnnotations = db.prepare(`
      SELECT COUNT(*) AS n FROM annotations a
      JOIN images i ON i.id = a.image_id
      WHERE i.project_id = ?
    `).get(projectId).n;

    // Review Status Breakdown
    const reviewRows = db.prepare(`
      SELECT review_status, COUNT(*) AS cnt FROM images WHERE project_id = ? ${baseImageFilter} GROUP BY review_status
    `).all(projectId);
    const reviewStatusBreakdown = { draft: 0, in_review: 0, approved: 0, rejected: 0 };
    for (const r of reviewRows) {
      if (reviewStatusBreakdown[r.review_status] !== undefined) {
        reviewStatusBreakdown[r.review_status] = r.cnt;
      }
    }

    // Dataset Balance
    const splitRows = db.prepare(`
      SELECT split, COUNT(*) AS cnt FROM images WHERE project_id = ? ${baseImageFilter} GROUP BY split
    `).all(projectId);
    const bySplit = { train: 0, valid: 0, test: 0 };
    for (const s of splitRows) {
      if (bySplit[s.split] !== undefined) bySplit[s.split] = s.cnt;
    }

    let perClass;
    if (project.label_type === 'text_rec') {
      const classes = db.prepare('SELECT id, name, color, sort_order FROM classes WHERE project_id = ?').all(projectId);
      const annotations = db.prepare(`
        SELECT a.class_id, a.text_content, a.type
        FROM annotations a
        JOIN images i ON i.id = a.image_id
        WHERE i.project_id = ? ${imageFilter}
      `).all(projectId);

      const charCounts = {};
      classes.forEach((c) => {
        charCounts[c.id] = 0;
      });

      // Map class name to ID for fast lookup (case-insensitive)
      const classNameToId = {};
      classes.forEach((c) => {
        classNameToId[c.name.toLowerCase()] = c.id;
      });

      for (const a of annotations) {
        if (a.type === 'text_rec' && a.text_content) {
          // Parse string into characters and increment matching classes
          const chars = a.text_content.split('');
          for (const char of chars) {
            const cid = classNameToId[char.toLowerCase()];
            if (cid !== undefined) {
              charCounts[cid]++;
            }
          }
        } else {
          // Fallback/standard annotation: count directly to class_id
          if (charCounts[a.class_id] !== undefined) {
            charCounts[a.class_id]++;
          }
        }
      }

      perClass = classes.map((c) => ({
        class_id: c.id,
        name: c.name,
        color: c.color,
        count: charCounts[c.id] || 0,
      })).sort((a, b) => a.sort_order - b.sort_order);
    } else {
      perClass = db.prepare(`
        SELECT c.id AS class_id, c.name, c.color, COUNT(a.id) AS count
        FROM classes c
        LEFT JOIN (
           SELECT ann.id, ann.class_id 
           FROM annotations ann 
           JOIN images i ON i.id = ann.image_id
           WHERE i.project_id = ? ${imageFilter}
        ) a ON a.class_id = c.id
        WHERE c.project_id = ?
        GROUP BY c.id
        ORDER BY c.sort_order ASC
      `).all(projectId, projectId);
    }

    // User Productivity
    const userProductivity = db.prepare(`
      SELECT u.id AS userId, u.username, u.display_name AS displayName,
        (SELECT COUNT(*) FROM images WHERE project_id = ? AND uploaded_by = u.id ${baseImageFilter}) AS imagesUploaded,
        (SELECT COUNT(*) FROM images WHERE project_id = ? AND completed_by = u.id ${baseImageFilter}) AS imagesCompleted,
        (SELECT COUNT(a.id) FROM annotations a JOIN images i ON i.id = a.image_id WHERE i.project_id = ? AND (i.completed_by = u.id OR i.uploaded_by = u.id) ${imageFilter}) AS annotationsCreated
      FROM users u
      ORDER BY imagesCompleted DESC
    `).all(projectId, projectId, projectId);

    res.json({
      totalImages,
      labeledImages,
      unlabeledImages,
      completedImages,
      totalAnnotations,
      reviewStatusBreakdown,
      datasetBalance: { bySplit, perClass },
      userProductivity,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 3. GET /api/projects/:projectId/reports/users ──────────────────────────
router.get('/:projectId/reports/users', checkProjectAssignment, (req, res) => {
  const { projectId } = req.params;
  const completedOnly = req.query.completedOnly === 'true';
  const baseImageFilter = completedOnly ? " AND completed_at IS NOT NULL" : "";
  const imageFilter = completedOnly ? " AND i.completed_at IS NOT NULL" : "";
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

    const users = db.prepare(`
      SELECT u.id AS userId, u.username, u.display_name AS displayName, u.role,
        (SELECT COUNT(*) FROM images WHERE project_id = ? AND uploaded_by = u.id ${baseImageFilter}) AS imagesUploaded,
        (SELECT COUNT(*) FROM images WHERE project_id = ? AND completed_by = u.id ${baseImageFilter}) AS imagesCompleted,
        (SELECT COUNT(a.id) FROM annotations a JOIN images i ON i.id = a.image_id WHERE i.project_id = ? AND (i.completed_by = u.id OR i.uploaded_by = u.id) ${imageFilter}) AS annotationsCount
      FROM users u
    `).all(projectId, projectId, projectId);

    const report = users.map((u) => {
      const speedAvg = u.imagesCompleted > 0
        ? Math.round((u.annotationsCount / u.imagesCompleted) * 10) / 10
        : 0;
      return { ...u, speedAvg };
    });

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 4. GET /api/projects/:projectId/reports/timeline ───────────────────────
router.get('/:projectId/reports/timeline', checkProjectAssignment, (req, res) => {
  const { projectId } = req.params;
  const days = Math.min(365, Math.max(7, parseInt(req.query.days || '30', 10)));
  const completedOnly = req.query.completedOnly === 'true';
  const baseImageFilter = completedOnly ? " AND completed_at IS NOT NULL" : "";
  const imageFilter = completedOnly ? " AND i.completed_at IS NOT NULL" : "";

  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

    const timelineRows = db.prepare(`
      SELECT
        d.date,
        COALESCE(img.imagesAdded, 0) AS imagesAdded,
        COALESCE(img.imagesCompleted, 0) AS imagesCompleted,
        COALESCE(ann.annotationsCount, 0) AS annotationsCount
      FROM (
        SELECT DISTINCT strftime('%Y-%m-%d', created_at) AS date FROM images WHERE project_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
        UNION
        SELECT DISTINCT strftime('%Y-%m-%d', completed_at) AS date FROM images WHERE project_id = ? AND completed_at IS NOT NULL AND completed_at >= datetime('now', '-' || ? || ' days')
      ) d
      LEFT JOIN (
        SELECT strftime('%Y-%m-%d', created_at) AS date,
               COUNT(*) AS imagesAdded,
               SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS imagesCompleted
        FROM images
        WHERE project_id = ? ${baseImageFilter}
        GROUP BY date
      ) img ON img.date = d.date
      LEFT JOIN (
        SELECT strftime('%Y-%m-%d', a.created_at) AS date,
               COUNT(*) AS annotationsCount
        FROM annotations a
        JOIN images i ON i.id = a.image_id
        WHERE i.project_id = ? ${imageFilter}
        GROUP BY date
      ) ann ON ann.date = d.date
      ORDER BY d.date ASC
    `).all(projectId, days, projectId, days, projectId, projectId);

    res.json(timelineRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 5. GET /api/projects/:projectId/reports/export?format=csv|json ─────────
router.get('/:projectId/reports/export', checkProjectAssignment, (req, res) => {
  const { projectId } = req.params;
  const format = (req.query.format || 'csv').toLowerCase();

  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

    const usersReport = db.prepare(`
      SELECT u.id AS userId, u.username, u.display_name AS displayName, u.role,
        (SELECT COUNT(*) FROM images WHERE project_id = ? AND uploaded_by = u.id) AS imagesUploaded,
        (SELECT COUNT(*) FROM images WHERE project_id = ? AND completed_by = u.id) AS imagesCompleted,
        (SELECT COUNT(a.id) FROM annotations a JOIN images i ON i.id = a.image_id WHERE i.project_id = ? AND (i.completed_by = u.id OR i.uploaded_by = u.id)) AS annotationsCount
      FROM users u
    `).all(projectId, projectId, projectId);

    const timelineReport = db.prepare(`
      SELECT strftime('%Y-%m-%d', created_at) AS date,
             COUNT(*) AS imagesAdded,
             SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS imagesCompleted
      FROM images
      WHERE project_id = ?
      GROUP BY date
      ORDER BY date ASC
    `).all(projectId);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="report_${projectId}_${Date.now()}.json"`);
      return res.json({
        project: { id: project.id, name: project.name },
        exportedAt: new Date().toISOString(),
        userProductivity: usersReport,
        timeline: timelineReport,
      });
    }

    // Build CSV Format
    const csvLines = [
      `# Project Report: ${project.name} (${project.id})`,
      `# Exported At: ${new Date().toISOString()}`,
      '',
      '[User Productivity Report]',
      'User ID,Username,Display Name,Role,Images Uploaded,Images Completed,Annotations Count',
      ...usersReport.map((u) =>
        `"${u.userId}","${u.username}","${u.displayName}","${u.role}",${u.imagesUploaded},${u.imagesCompleted},${u.annotationsCount}`
      ),
      '',
      '[Timeline Summary Report]',
      'Date,Images Added,Images Completed',
      ...timelineReport.map((t) => `"${t.date}",${t.imagesAdded},${t.imagesCompleted}`),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report_${projectId}_${Date.now()}.csv"`);
    res.send(csvLines.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

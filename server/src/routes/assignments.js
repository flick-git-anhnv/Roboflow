// Gán khối lượng công việc (% ảnh) cho từng user trong project — chỉ admin
// mới đặt % / chia ảnh; mọi role đã login đều xem được bảng tiến độ.
import { Router } from 'express';
import { db, logActivity } from '../db.js';
import { requireRole } from '../middleware/roles.js';

const router = Router({ mergeParams: true });

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// GET /api/projects/:projectId/assignments
// Trả về % đã đặt + tiến độ thực tế (đã gán / đã xong) cho từng user có % > 0
// hoặc đã có ảnh được gán trong project — không liệt kê toàn bộ user hệ thống
// để tránh nhiễu khi project chưa cấu hình phân công.
router.get('/', (req, res) => {
  const { projectId } = req.params;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  const rows = db.prepare(`
    SELECT
      u.id AS user_id, u.username, u.display_name, u.role, u.color,
      COALESCE(pa.percent, 0) AS percent,
      (SELECT COUNT(*) FROM images i WHERE i.project_id = ? AND i.assigned_to = u.id) AS assigned_count,
      (SELECT COUNT(*) FROM images i WHERE i.project_id = ? AND i.assigned_to = u.id AND i.completed_at IS NOT NULL) AS done_count
    FROM users u
    LEFT JOIN project_assignments pa ON pa.project_id = ? AND pa.user_id = u.id
    WHERE u.is_active = 1
      AND (pa.percent > 0 OR EXISTS (SELECT 1 FROM images i2 WHERE i2.project_id = ? AND i2.assigned_to = u.id))
    ORDER BY pa.percent DESC, u.display_name ASC
  `).all(projectId, projectId, projectId, projectId);

  const totals = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN assigned_to IS NOT NULL THEN 1 ELSE 0 END) AS assigned_total,
      SUM(CASE WHEN assigned_to IS NULL THEN 1 ELSE 0 END) AS unassigned_total
    FROM images WHERE project_id = ?
  `).get(projectId);

  res.json({
    assignments: rows,
    totalPercent: rows.reduce((sum, r) => sum + r.percent, 0),
    images: {
      total: totals.total || 0,
      assigned: totals.assigned_total || 0,
      unassigned: totals.unassigned_total || 0,
    },
  });
});

// GET /api/projects/:projectId/assignments/candidates — toàn bộ user active,
// dùng cho dropdown "thêm user vào phân công" (không lọc theo percent>0 như GET /).
router.get('/candidates', (req, res) => {
  const users = db.prepare(
    'SELECT id AS user_id, username, display_name, role, color FROM users WHERE is_active = 1 ORDER BY display_name ASC'
  ).all();
  res.json(users);
});

// PUT /api/projects/:projectId/assignments — admin only.
// Body: { assignments: [{ user_id, percent }, ...] } — upsert % cho từng user.
// KHÔNG bắt buộc tổng = 100 (theo quyết định: cho phép để dư ảnh chưa gán ai).
router.put('/', requireRole('admin'), (req, res) => {
  const { projectId } = req.params;
  const { assignments } = req.body;

  if (!Array.isArray(assignments)) {
    return res.status(400).json({ error: 'assignments phải là mảng [{user_id, percent}]' });
  }
  for (const a of assignments) {
    if (typeof a.user_id !== 'number' || typeof a.percent !== 'number' || a.percent < 0 || a.percent > 100) {
      return res.status(400).json({ error: 'Mỗi assignment cần user_id (number) và percent (0-100)' });
    }
  }

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  const upsert = db.prepare(`
    INSERT INTO project_assignments (project_id, user_id, percent, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(project_id, user_id) DO UPDATE SET percent = excluded.percent, updated_at = excluded.updated_at
  `);
  db.transaction(() => {
    for (const a of assignments) upsert.run(projectId, a.user_id, a.percent);
  })();

  logActivity(projectId, req.user.id, 'assignment_percent_updated', { assignments });
  res.json({ ok: true });
});

// POST /api/projects/:projectId/assignments/distribute — admin only.
// % là tỉ lệ TUYỆT ĐỐI trên TỔNG số ảnh của project (không phải % tương đối
// giữa các user có percent>0) — VD: 100 ảnh, A=50% nghĩa là A cần có ĐÚNG 50
// ảnh được gán, dù B/C có đặt % hay không. Mỗi lần "Chia ảnh" chỉ TOP-UP phần
// còn THIẾU so với target (target - số đã gán hiện tại), lấy ngẫu nhiên từ
// ảnh CHƯA gán — KHÔNG bao giờ động vào ảnh đã gán từ trước (không xáo trộn
// việc user khác đang làm dở). Nếu tổng % < 100, phần dư mãi không có ai đạt
// target sẽ tự nhiên còn lại "chưa gán ai" — đúng như thiết kế cho phép tự do.
router.post('/distribute', requireRole('admin'), (req, res) => {
  const { projectId } = req.params;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  const percents = db.prepare(
    'SELECT user_id, percent FROM project_assignments WHERE project_id = ? AND percent > 0'
  ).all(projectId);
  if (percents.length === 0) {
    return res.status(400).json({ error: 'Chưa đặt % cho user nào — hãy lưu % trước khi chia ảnh' });
  }

  const totalImages = db.prepare('SELECT COUNT(*) AS n FROM images WHERE project_id = ?').get(projectId).n;
  if (totalImages === 0) {
    return res.json({ ok: true, distributed: 0, message: 'Project chưa có ảnh nào' });
  }

  const unassignedIds = shuffle(db.prepare(
    'SELECT id FROM images WHERE project_id = ? AND assigned_to IS NULL ORDER BY created_at ASC'
  ).all(projectId).map((r) => r.id));

  if (unassignedIds.length === 0) {
    return res.json({ ok: true, distributed: 0, message: 'Không còn ảnh nào chưa gán' });
  }

  const currentAssigned = new Map(db.prepare(`
    SELECT assigned_to AS user_id, COUNT(*) AS n FROM images
    WHERE project_id = ? AND assigned_to IS NOT NULL GROUP BY assigned_to
  `).all(projectId).map((r) => [r.user_id, r.n]));

  const needs = percents
    .map((p) => {
      const target = Math.round((p.percent / 100) * totalImages);
      const current = currentAssigned.get(p.user_id) || 0;
      return { user_id: p.user_id, need: Math.max(0, target - current) };
    })
    .filter((n) => n.need > 0);

  if (needs.length === 0) {
    return res.json({ ok: true, distributed: 0, message: 'Mọi user đã đạt hoặc vượt % mục tiêu — không cần chia thêm' });
  }

  const totalNeed = needs.reduce((s, n) => s + n.need, 0);
  const pool = unassignedIds.slice(0, Math.min(totalNeed, unassignedIds.length));

  // Đủ ảnh cho mọi nhu cầu → giao đúng số cần. Thiếu ảnh → largest-remainder
  // để chia phần còn lại công bằng nhất theo đúng tỉ lệ nhu cầu của từng người.
  let quotas;
  if (totalNeed <= pool.length) {
    quotas = needs.map((n) => ({ user_id: n.user_id, base: n.need }));
  } else {
    quotas = needs.map((n) => {
      const exact = (n.need / totalNeed) * pool.length;
      return { user_id: n.user_id, base: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    const assignedSoFar = quotas.reduce((s, q) => s + q.base, 0);
    const leftover = pool.length - assignedSoFar;
    quotas.sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < leftover; i++) quotas[i % quotas.length].base += 1;
  }

  const update = db.prepare('UPDATE images SET assigned_to = ? WHERE id = ?');
  let cursor = 0;
  const summary = [];
  db.transaction(() => {
    for (const q of quotas) {
      const slice = pool.slice(cursor, cursor + q.base);
      cursor += q.base;
      for (const imgId of slice) update.run(q.user_id, imgId);
      if (slice.length > 0) summary.push({ user_id: q.user_id, assigned: slice.length });
    }
  })();

  logActivity(projectId, req.user.id, 'assignment_distributed', { summary, poolSize: pool.length, totalImages });
  res.json({ ok: true, distributed: pool.length, summary });
});

// POST /api/projects/:projectId/assignments/reset — admin only.
// Gỡ gán TOÀN BỘ ảnh trong project (assigned_to = NULL) để chia lại từ đầu.
// KHÔNG xoá % đã lưu trong project_assignments (giữ lại để admin chỉnh rồi chia lại).
router.post('/reset', requireRole('admin'), (req, res) => {
  const { projectId } = req.params;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  const { changes } = db.prepare(
    'UPDATE images SET assigned_to = NULL WHERE project_id = ? AND assigned_to IS NOT NULL'
  ).run(projectId);

  logActivity(projectId, req.user.id, 'assignment_reset', { unassigned: changes });
  res.json({ ok: true, unassigned: changes });
});

export default router;

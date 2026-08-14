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
// Tiến độ (done_count) CHỈ tính trên các ảnh đã đánh dấu là xong (completed_at IS NOT NULL).
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
      SUM(CASE WHEN assigned_to IS NULL THEN 1 ELSE 0 END) AS unassigned_total,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS done_total,
      SUM(CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END) AS undone_total
    FROM images WHERE project_id = ?
  `).get(projectId);

  res.json({
    assignments: rows,
    totalPercent: rows.reduce((sum, r) => sum + r.percent, 0),
    images: {
      total: totals.total || 0,
      assigned: totals.assigned_total || 0,
      unassigned: totals.unassigned_total || 0,
      done: totals.done_total || 0,
      undone: totals.undone_total || 0,
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

// DELETE /api/projects/:projectId/assignments/:userId — admin only
// Xoá user khỏi danh sách phân công (xoá mục tiêu %)
router.delete('/:userId', requireRole('admin'), (req, res) => {
  const { projectId, userId } = req.params;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  db.prepare('DELETE FROM project_assignments WHERE project_id = ? AND user_id = ?').run(projectId, userId);
  logActivity(projectId, req.user.id, 'assignment_deleted', { user_id: Number(userId) });
  res.json({ ok: true });
});

// POST /api/projects/:projectId/assignments/distribute — admin only.
// % là tỉ lệ TUYỆT ĐỐI trên TỔNG số ảnh của project (không phải % tương đối
// giữa các user có percent>0) — VD: 100 ảnh, A=50% nghĩa là A cần có ĐÚNG 50
// ảnh được gán, dù B/C có đặt % hay không.
// Khi "Chia ảnh", hệ thống sẽ:
// 1. Giữ nguyên 100% các ảnh đã đánh dấu xong (completed_at IS NOT NULL).
// 2. Thu hồi các ảnh chưa hoàn thành vượt mức (excess) từ những user đang có nhiều hơn % mục tiêu.
// 3. Phân bổ pool ảnh chưa hoàn thành cho các user còn thiếu theo Largest Remainder Method.
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

  // Số ảnh ĐÃ HOÀN THÀNH của từng user (bảo toàn 100%, không bao giờ thay đổi hoặc gỡ)
  const doneCounts = new Map(db.prepare(`
    SELECT assigned_to AS user_id, COUNT(*) AS n FROM images
    WHERE project_id = ? AND assigned_to IS NOT NULL AND completed_at IS NOT NULL
    GROUP BY assigned_to
  `).all(projectId).map((r) => [r.user_id, r.n]));

  // Số ảnh CHƯA HOÀN THÀNH đang được gán cho từng user
  const undoneCounts = new Map(db.prepare(`
    SELECT assigned_to AS user_id, COUNT(*) AS n FROM images
    WHERE project_id = ? AND assigned_to IS NOT NULL AND completed_at IS NULL
    GROUP BY assigned_to
  `).all(projectId).map((r) => [r.user_id, r.n]));

  // Tính target, need (thiếu), excess (thừa ảnh chưa hoàn thành)
  const userStats = percents.map((p) => {
    const target = Math.round((p.percent / 100) * totalImages);
    const done = doneCounts.get(p.user_id) || 0;
    const undone = undoneCounts.get(p.user_id) || 0;
    const current = done + undone;
    const need = Math.max(0, target - current);
    const excess = Math.max(0, Math.min(undone, current - target));
    return { user_id: p.user_id, target, done, undone, current, need, excess };
  });

  const totalNeed = userStats.reduce((s, u) => s + u.need, 0);

  // Số ảnh chưa gán và chưa hoàn thành trong project
  const unassignedUndone = db.prepare(`
    SELECT COUNT(*) AS n FROM images
    WHERE project_id = ? AND assigned_to IS NULL AND completed_at IS NULL
  `).get(projectId).n;

  if (totalNeed === 0 && unassignedUndone === 0) {
    return res.json({ ok: true, distributed: 0, message: 'Mọi user đã đạt hoặc vượt % mục tiêu — không cần chia thêm' });
  }

  const unassignStmt = db.prepare('UPDATE images SET assigned_to = NULL WHERE id = ?');
  const updateStmt = db.prepare('UPDATE images SET assigned_to = ? WHERE id = ?');

  const summary = [];
  db.transaction(() => {
    // 1. Thu hồi excess từ các user có thừa ảnh chưa xong
    for (const u of userStats) {
      if (u.excess > 0) {
        const excessImgs = db.prepare(`
          SELECT id FROM images
          WHERE project_id = ? AND assigned_to = ? AND completed_at IS NULL
          LIMIT ?
        `).all(projectId, u.user_id, u.excess);
        for (const img of excessImgs) {
          unassignStmt.run(img.id);
        }
      }
    }

    // 2. Lấy toàn bộ pool ảnh chưa gán và chưa xong để phân bổ
    const pool = shuffle(db.prepare(`
      SELECT id FROM images
      WHERE project_id = ? AND assigned_to IS NULL AND completed_at IS NULL
      ORDER BY created_at ASC
    `).all(projectId).map((r) => r.id));

    if (pool.length === 0 || totalNeed === 0) return;

    // 3. Phân bổ cho các user có need > 0
    const needyUsers = userStats.filter((u) => u.need > 0);
    const effectivePool = pool.slice(0, Math.min(totalNeed, pool.length));

    let quotas;
    if (totalNeed <= effectivePool.length) {
      quotas = needyUsers.map((n) => ({ user_id: n.user_id, base: n.need }));
    } else {
      quotas = needyUsers.map((n) => {
        const exact = (n.need / totalNeed) * effectivePool.length;
        return { user_id: n.user_id, base: Math.floor(exact), remainder: exact - Math.floor(exact) };
      });
      const assignedSoFar = quotas.reduce((s, q) => s + q.base, 0);
      const leftover = effectivePool.length - assignedSoFar;
      quotas.sort((a, b) => b.remainder - a.remainder);
      for (let i = 0; i < leftover; i++) quotas[i % quotas.length].base += 1;
    }

    let cursor = 0;
    for (const q of quotas) {
      if (q.base <= 0) continue;
      const slice = effectivePool.slice(cursor, cursor + q.base);
      cursor += q.base;
      for (const imgId of slice) updateStmt.run(q.user_id, imgId);
      summary.push({ user_id: q.user_id, assigned: slice.length });
    }
  })();

  const distributedCount = summary.reduce((s, r) => s + r.assigned, 0);
  logActivity(projectId, req.user.id, 'assignment_distributed', { summary, distributed: distributedCount, totalImages });
  res.json({ ok: true, distributed: distributedCount, summary });
});

// POST /api/projects/:projectId/assignments/reset — admin only.
// Gỡ gán các ảnh CHƯA HOÀN THÀNH (completed_at IS NULL) trong project để chia lại.
// BỎ QUA các ảnh đã đánh dấu xong (completed_at IS NOT NULL) — giữ nguyên quyền sở hữu công việc đã làm.
// KHÔNG xoá % đã lưu trong project_assignments (giữ lại để admin chỉnh rồi chia lại).
router.post('/reset', requireRole('admin'), (req, res) => {
  const { projectId } = req.params;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  const { changes } = db.prepare(`
    UPDATE images 
    SET assigned_to = NULL 
    WHERE project_id = ? 
      AND assigned_to IS NOT NULL 
      AND completed_at IS NULL
  `).run(projectId);

  logActivity(projectId, req.user.id, 'assignment_reset', { unassigned: changes });
  res.json({ ok: true, unassigned: changes });
});

export default router;

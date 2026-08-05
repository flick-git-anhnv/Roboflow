/**
 * User management routes (AD-A5: CRUD users → admin only, PATCH self → all roles).
 * GET    /api/users           — admin only: list users
 * POST   /api/users           — admin only: create user (alias for register)
 * GET    /api/users/:id       — admin or self
 * PATCH  /api/users/:id       — self: display_name/color/password; admin: + role/is_active
 * DELETE /api/users/:id       — admin only (soft-delete: is_active=0; hard-delete nếu không có FK)
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db.js';
import { requireRole } from '../middleware/roles.js';

const router = Router();

const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const BCRYPT_COST = 12;

// Whitelist columns — không bao giờ trả password_hash (AD-A2: chống info disclosure)
function safeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    color: u.color,
    is_active: u.is_active,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  };
}

// GET /api/users — admin only
router.get('/', requireRole('admin'), (req, res) => {
  const users = db.prepare(
    'SELECT id, username, display_name, role, color, is_active, created_at, last_login_at FROM users ORDER BY created_at ASC'
  ).all();
  res.json(users);
});

// POST /api/users — admin only (create new user)
router.post('/', requireRole('admin'), async (req, res) => {
  const { username, password, display_name, role = 'annotator', color = '#4A3F8C' } = req.body || {};

  if (!username || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'INVALID_USERNAME', detail: 'Username phải 3-32 ký tự [A-Za-z0-9._-]' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'INVALID_PASSWORD', detail: 'Mật khẩu tối thiểu 6 ký tự' });
  }
  if (!['annotator', 'reviewer', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'INVALID_ROLE' });
  }
  if (!COLOR_RE.test(color)) {
    return res.status(400).json({ error: 'INVALID_COLOR', detail: 'Color phải là #RRGGBB' });
  }

  // AD-A1: normalize username lowercase khi INSERT (chống trùng case-insensitive)
  const normalizedUsername = username.toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(normalizedUsername);
  if (existing) return res.status(409).json({ error: 'USERNAME_TAKEN' });

  const hash = await bcrypt.hash(String(password), BCRYPT_COST);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role, color) VALUES (?, ?, ?, ?, ?)'
  ).run(normalizedUsername, hash, display_name || username, role, color);

  const created = db.prepare(
    'SELECT id, username, display_name, role, color, is_active, created_at FROM users WHERE id = ?'
  ).get(result.lastInsertRowid);
  res.status(201).json(safeUser(created));
});

// GET /api/users/:id — self or admin
router.get('/:id', (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (req.user.role !== 'admin' && req.user.id !== targetId) {
    return res.status(403).json({ error: 'AUTH_FORBIDDEN' });
  }
  const user = db.prepare(
    'SELECT id, username, display_name, role, color, is_active, created_at, last_login_at FROM users WHERE id = ?'
  ).get(targetId);
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  res.json(safeUser(user));
});

// PATCH /api/users/:id — self (display_name/color/password) OR admin (+ role/is_active)
router.patch('/:id', async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const isSelf = req.user.id === targetId;
  const isAdmin = req.user.role === 'admin';

  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: 'AUTH_FORBIDDEN' });
  }

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!existing) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  const { display_name, color, password, role, is_active } = req.body || {};

  // AD-A5/EoP: self chỉ được sửa display_name, color, password — KHÔNG role/is_active
  // AD-A3 §6.3 warning #3: whitelist body field PATCH self (chống EoP annotator→admin)
  let newDisplayName = existing.display_name;
  let newColor = existing.color;
  let newHash = existing.password_hash;
  let newRole = existing.role;
  let newIsActive = existing.is_active;

  if (display_name !== undefined) newDisplayName = String(display_name).slice(0, 64) || existing.display_name;
  if (color !== undefined) {
    if (!COLOR_RE.test(color)) return res.status(400).json({ error: 'INVALID_COLOR' });
    newColor = color;
  }
  if (password !== undefined) {
    if (String(password).length < 6) return res.status(400).json({ error: 'INVALID_PASSWORD' });
    newHash = await bcrypt.hash(String(password), BCRYPT_COST);
  }

  // Admin-only fields
  if (role !== undefined || is_active !== undefined) {
    if (!isAdmin) return res.status(403).json({ error: 'AUTH_FORBIDDEN' }); // EoP guard
    if (role !== undefined) {
      if (!['annotator', 'reviewer', 'admin'].includes(role)) return res.status(400).json({ error: 'INVALID_ROLE' });
      newRole = role;
    }
    if (is_active !== undefined) newIsActive = is_active ? 1 : 0;
  }

  db.prepare(
    'UPDATE users SET display_name=?, color=?, password_hash=?, role=?, is_active=? WHERE id=?'
  ).run(newDisplayName, newColor, newHash, newRole, newIsActive, targetId);

  const updated = db.prepare(
    'SELECT id, username, display_name, role, color, is_active, created_at, last_login_at FROM users WHERE id=?'
  ).get(targetId);
  res.json(safeUser(updated));
});

// DELETE /api/users/:id — admin only
// AD-A1: soft-delete (is_active=0) nếu có FK; hard-delete nếu chưa có
router.delete('/:id', requireRole('admin'), (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!existing) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  // Kiểm tra FK trong annotation_history (Phase 3 chưa có bảng này nên fallback hard-delete)
  let hasFk = false;
  try {
    const fkCheck = db.prepare('SELECT 1 FROM annotation_history WHERE actor_id = ? LIMIT 1').get(targetId);
    hasFk = !!fkCheck;
  } catch {
    hasFk = false; // bảng chưa tồn tại
  }

  if (hasFk) {
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(targetId);
    res.json({ ok: true, soft_deleted: true });
  } else {
    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    res.status(204).end();
  }
});

export default router;

/**
 * Auth routes (AD-A2, AD-A7).
 * POST /api/auth/login   — rate-limited (10/15min/IP, skipSuccessful)
 * POST /api/auth/logout  — clear cookie, 204
 * GET  /api/auth/me      — trả user hiện tại (authRequired áp ở index.js sau router này)
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { db } from '../db.js';
import { getJwtSecret } from '../lib/jwt-secret.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

// AD-A7: Rate-limit chỉ áp POST /api/auth/login
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15 phút
  max: 10,                          // tối đa 10 request
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,     // chỉ đếm request fail
  handler: (req, res) => {
    const retryAfterSec = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json({ error: 'AUTH_RATE_LIMITED', retryAfterSec });
  },
});

// AD-A7: username validation regex
const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

// Delay ngẫu nhiên 150-300ms (AD-A2: chống enumeration + timing attack)
function authDelay() {
  if (process.env.NODE_ENV === 'test') return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 150));
}

// POST /api/auth/login — PUBLIC
router.post('/login', loginRateLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    await authDelay();
    return res.status(401).json({ error: 'AUTH_INVALID_CREDENTIALS' });
  }

  // AD-A1: so sánh case-insensitive bằng LOWER()
  const user = db.prepare(
    'SELECT id, username, password_hash, display_name, role, color, is_active FROM users WHERE LOWER(username) = LOWER(?)'
  ).get(String(username).trim());

  if (!user) {
    await authDelay();
    console.log(`[auth] login fail — username not found: ${username}`);
    return res.status(401).json({ error: 'AUTH_INVALID_CREDENTIALS' }); // AD-A2: same message
  }

  const match = await bcrypt.compare(String(password), user.password_hash);
  if (!match) {
    await authDelay();
    console.log(`[auth] login fail — wrong password for: ${user.username}`);
    return res.status(401).json({ error: 'AUTH_INVALID_CREDENTIALS' }); // AD-A2: same message
  }

  if (!user.is_active) {
    await authDelay();
    return res.status(401).json({ error: 'AUTH_DISABLED' });
  }

  // Issue JWT (AD-A2)
  const payload = {
    sub: user.id,
    usr: user.username,
    rol: user.role,
    clr: user.color,
  };
  const token = jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: '24h' });

  // Cập nhật last_login_at
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

  // Cookie httpOnly (AD-A2)
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 86400 * 1000,
  };
  if (process.env.AUTH_COOKIE_SECURE === '1') cookieOpts.secure = true;
  res.cookie('kztek_token', token, cookieOpts);

  console.log(`[auth] login success: ${user.username} (${user.role})`);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      color: user.color,
    },
  });
});

// POST /api/auth/logout — cần authRequired (gắn ở index.js)
router.post('/logout', authRequired, (req, res) => {
  res.clearCookie('kztek_token', { path: '/' });
  res.status(204).end();
});

// GET /api/auth/me — cần authRequired
router.get('/me', authRequired, (req, res) => {
  // AD-A6: SELECT whitelist column, không SELECT * (chống info disclosure password_hash)
  const user = db.prepare(
    'SELECT id, username, display_name, role, color, created_at, last_login_at FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(401).json({ error: 'AUTH_USER_DISABLED' });
  res.json(user);
});

export default router;

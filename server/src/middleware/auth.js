/**
 * Auth middleware (AD-A4).
 * authRequired: verify JWT, load req.user, check is_active.
 * Supports AUTH_DISABLED=1 env for emergency hotfix rollback.
 */
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { getJwtSecret } from '../lib/jwt-secret.js';

function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return req.cookies?.kztek_token || null;
}

export function authRequired(req, res, next) {
  // AUTH_DISABLED=1: emergency rollback — inject bootstrap admin (AD-A4 §5)
  if (process.env.AUTH_DISABLED === '1') {
    const adminUser = db.prepare("SELECT id, username, role, color FROM users WHERE role = 'admin' LIMIT 1").get();
    req.user = adminUser
      ? { id: adminUser.id, username: adminUser.username, role: 'admin', color: adminUser.color }
      : { id: 1, username: 'admin', role: 'admin', color: '#4A3F8C' };
    return next();
  }

  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });

  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }); // AD-A2: algorithm pinned (chống algorithm confusion)
  } catch {
    return res.status(401).json({ error: 'AUTH_TOKEN_INVALID' });
  }

  // AD-A4: SELECT per request để kiểm tra is_active real-time
  const user = db.prepare(
    'SELECT id, username, role, color, is_active FROM users WHERE id = ?'
  ).get(payload.sub);

  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'AUTH_USER_DISABLED' });
  }

  req.user = { id: user.id, username: user.username, role: user.role, color: user.color };
  next();
}

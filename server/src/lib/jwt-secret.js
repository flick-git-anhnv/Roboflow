/**
 * JWT Secret management (AD-A3).
 * - Env bắt buộc: AUTH_JWT_SECRET (≥ 32 chars)
 * - production (NODE_ENV != 'development'): refuse start nếu thiếu
 * - development: sinh secret ngẫu nhiên, lưu vào DATA_DIR/.jwt-secret.dev
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../db.js';

let _cachedSecret = null;

export function getJwtSecret() {
  if (_cachedSecret) return _cachedSecret;

  const envSecret = process.env.AUTH_JWT_SECRET;
  if (envSecret) {
    if (envSecret.length < 32) {
      console.error('[FATAL] AUTH_JWT_SECRET too short — minimum 32 characters required');
      process.exit(1);
    }
    _cachedSecret = envSecret;
    return _cachedSecret;
  }

  const isProd = process.env.NODE_ENV && process.env.NODE_ENV !== 'development';
  if (isProd) {
    console.error('[FATAL] AUTH_JWT_SECRET missing in production. Set AUTH_JWT_SECRET env variable.');
    process.exit(1);
  }

  // Dev/test mode: read or generate secret file
  const devSecretPath = path.join(DATA_DIR, '.jwt-secret.dev');
  if (fs.existsSync(devSecretPath)) {
    const existing = fs.readFileSync(devSecretPath, 'utf8').trim();
    if (existing.length >= 32) {
      _cachedSecret = existing;
      console.warn('[WARN] AUTH_JWT_SECRET not set; using generated dev secret at ' + devSecretPath + ' — DO NOT USE IN PRODUCTION');
      return _cachedSecret;
    }
  }

  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(devSecretPath, generated, { mode: 0o600 });
  } catch {
    // On Windows mode setting may fail — still usable
    fs.writeFileSync(devSecretPath, generated);
  }
  _cachedSecret = generated;
  console.warn('[WARN] AUTH_JWT_SECRET not set; generated dev secret saved to ' + devSecretPath + ' — DO NOT USE IN PRODUCTION');
  return _cachedSecret;
}

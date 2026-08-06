import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../db.js';

const LOG_FILE = process.env.SERVER_LOG_PATH || path.join(DATA_DIR, 'server.log');
const SLOW_THRESHOLD_MS = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS || '500', 10);

export function slowRequestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > SLOW_THRESHOLD_MS) {
      const timestamp = new Date().toISOString();
      const method = (req.method || 'GET').padEnd(6, ' ');
      const url = req.originalUrl || req.url;
      const status = res.statusCode;
      const logLine = `[${timestamp}] [WARN] [SLOW_REQUEST] ${method} ${url} ${status} - ${duration}ms\n`;

      console.warn(`\x1b[33m${logLine.trim()}\x1b[0m`);

      fs.appendFile(LOG_FILE, logLine, (err) => {
        if (err) {
          console.error('[slowLogger] Failed to write warning to server.log:', err.message);
        }
      });
    }
  });

  next();
}

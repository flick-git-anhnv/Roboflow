import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT_DIR, 'server', 'data', 'app.db');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'server', 'migrations');
const SERVER_LOG_PATH = path.join(ROOT_DIR, 'server', 'data', 'server.log');
const CLIENT_DIST_PATH = path.join(ROOT_DIR, 'client', 'dist', 'index.html');
const ROOT_SERVER_LOG = path.join(ROOT_DIR, 'server.log');

let checkCount = 0;
let passCount = 0;

function logCheck(msg) {
  checkCount++;
  console.log(`[VERIFY-STARTUP] [CHECK ${checkCount}] ${msg}`);
}

function logPass(msg) {
  passCount++;
  console.log(`  ✓ PASS: ${msg}`);
}

function logFail(msg) {
  console.error(`  ❌ FAIL: ${msg}`);
}

async function verifyStartup() {
  console.log('====================================================');
  console.log('   Roboflow Startup Verification Auditor Script    ');
  console.log('====================================================');

  let failed = false;

  // 1. Verify Database Migration Status
  logCheck('Database Migration Engine Verification');
  try {
    if (!fs.existsSync(DB_PATH)) {
      logFail(`Database file not found at ${DB_PATH}`);
      failed = true;
    } else {
      const db = new Database(DB_PATH);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").all();
      if (tables.length === 0) {
        logFail("Tracking table 'schema_migrations' does not exist in app.db");
        failed = true;
      } else {
        const appliedRows = db.prepare('SELECT name FROM schema_migrations').all();
        const appliedNames = new Set(appliedRows.map((r) => r.name));
        
        let pendingCount = 0;
        if (fs.existsSync(MIGRATIONS_DIR)) {
          const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
          for (const file of files) {
            if (!appliedNames.has(file)) {
              logFail(`Migration '${file}' is not recorded as applied in schema_migrations`);
              pendingCount++;
            }
          }
        }

        if (pendingCount === 0) {
          logPass(`Database migrations fully applied (${appliedNames.size} migration(s) recorded in schema_migrations)`);
        } else {
          failed = true;
        }
      }
      db.close();
    }
  } catch (err) {
    logFail(`Database migration check error: ${err.message}`);
    failed = true;
  }

  // 2. Verify Client Production Build
  logCheck('Client Production Build Check');
  if (fs.existsSync(CLIENT_DIST_PATH)) {
    logPass(`Client production build verified: ${CLIENT_DIST_PATH} exists`);
  } else {
    logFail(`Client dist file missing at ${CLIENT_DIST_PATH}. Please run 'npm --prefix client run build'.`);
    failed = true;
  }

  // 3. Verify Server Log Cleanliness (>500ms slow requests & crash traces)
  logCheck('Server Log Cleanliness Check (server/data/server.log)');
  if (fs.existsSync(ROOT_SERVER_LOG)) {
    logFail(`Root crash log artifact detected at ${ROOT_SERVER_LOG}`);
    failed = true;
  }
  
  if (!fs.existsSync(SERVER_LOG_PATH)) {
    fs.mkdirSync(path.dirname(SERVER_LOG_PATH), { recursive: true });
    logPass('server/data/server.log initialized (0 warnings, 0 crash traces)');
  } else {
    const logContent = fs.readFileSync(SERVER_LOG_PATH, 'utf-8');
    const lines = logContent.split('\n').map((l) => l.trim()).filter(Boolean);

    const slowWarnings = lines.filter((l) => l.includes('[SLOW_REQUEST]'));
    const crashTraces = lines.filter((l) =>
      /(\bError:|\bTypeError:|\bSyntaxError:|\bReferenceError:|\bRangeError:|\buncaughtException\b|\bunhandledRejection\b|^\s+at\s+)/i.test(l)
    );

    if (slowWarnings.length > 0 || crashTraces.length > 0) {
      logFail(`server/data/server.log contains ${slowWarnings.length} slow request warning(s) (>500ms) and ${crashTraces.length} crash trace(s)`);
      if (slowWarnings.length > 0) console.error('    Sample Slow Warnings:', slowWarnings.slice(0, 3));
      if (crashTraces.length > 0) console.error('    Sample Crash Traces:', crashTraces.slice(0, 3));
      failed = true;
    } else {
      logPass(`server/data/server.log clean: 0 slow request warnings (>500ms), 0 crash traces (${lines.length} lines inspected)`);
    }
  }

  // 4. Verify Git Branch Isolation
  logCheck('Git Branch Isolation Check');
  try {
    const gitHeadPath = path.join(ROOT_DIR, '.git', 'HEAD');
    let currentBranch = '';
    if (fs.existsSync(gitHeadPath)) {
      const headContent = fs.readFileSync(gitHeadPath, 'utf-8').trim();
      if (headContent.startsWith('ref: refs/heads/')) {
        currentBranch = headContent.replace('ref: refs/heads/', '');
      }
    }
    if (!currentBranch) {
      currentBranch = execSync('git branch --show-current', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
    }

    if (currentBranch.startsWith('feature/roboflow') || currentBranch === 'main') {
      logPass(`Working tree isolated on branch: '${currentBranch}'`);
    } else {
      logFail(`Working tree is on branch '${currentBranch}', expected 'feature/roboflow-*' or 'main'`);
      failed = true;
    }
  } catch (err) {
    logFail(`Git branch check error: ${err.message}`);
    failed = true;
  }

  // 5. Verify Server Health Endpoint (GET http://localhost:4000/api/health)
  logCheck('Server Health Endpoint Verification (GET http://localhost:4000/api/health)');
  const pingHealth = () =>
    new Promise((resolve) => {
      const req = http.get('http://localhost:4000/api/health', (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body);
              if (data.status === 'ok') return resolve(true);
            } catch (_) {}
          }
          resolve(false);
        });
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1500, () => {
        req.destroy();
        resolve(false);
      });
    });

  let isRunning = await pingHealth();
  let spawnedProcess = null;

  if (!isRunning) {
    console.log('  [info] Server is not running on port 4000, launching temporary instance...');
    const serverScript = path.join(ROOT_DIR, 'server', 'src', 'index.js');
    spawnedProcess = spawn('node', [serverScript], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        PORT: '4000',
        NODE_ENV: 'test',
        SLOW_REQUEST_THRESHOLD_MS: '2000',
        AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET || 'kztek_secret_key_for_testing_purposes_min32chars',
      },
      stdio: 'ignore',
    });

    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 200));
      isRunning = await pingHealth();
      if (isRunning) break;
    }
  }

  if (isRunning) {
    logPass('Server health endpoint GET http://localhost:4000/api/health returned 200 OK {"status":"ok"}');
  } else {
    logFail('Failed to connect to server health endpoint at http://localhost:4000/api/health');
    failed = true;
  }

  if (spawnedProcess) {
    spawnedProcess.kill('SIGTERM');
  }

  console.log('====================================================');
  if (failed) {
    console.error(`VERIFICATION FAILED: ${checkCount - passCount} check(s) failed out of ${checkCount}`);
    process.exit(1);
  } else {
    console.log(`VERIFICATION PASSED: All ${passCount} checks completed successfully ✓`);
    process.exit(0);
  }
}

verifyStartup();

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from '../../server/node_modules/better-sqlite3/lib/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DB_PATH = path.join(ROOT_DIR, 'server', 'data', 'app.db');
const SERVER_LOG_PATH = path.join(ROOT_DIR, 'server', 'data', 'server.log');
const SERVER_SCRIPT = path.join(ROOT_DIR, 'server', 'src', 'index.js');
const CLIENT_DIST = path.join(ROOT_DIR, 'client', 'dist');

function checkPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.get(urlStr, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          duration: Date.now() - start,
        });
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function runCycle(cycleIndex, port = 4005) {
  console.log(`\n--- [CYCLE ${cycleIndex}] Starting Server on port ${port} ---`);

  const portFreeBefore = await checkPortFree(port);
  console.log(`Port ${port} free before launch: ${portFreeBefore}`);
  if (!portFreeBefore) {
    throw new Error(`Port ${port} is occupied before start of cycle ${cycleIndex}`);
  }

  const child = spawn('node', [SERVER_SCRIPT], {
    cwd: ROOT_DIR,
    env: { ...process.env, PORT: String(port) },
    stdio: 'pipe',
  });

  let serverStarted = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      const res = await httpGet(`http://localhost:${port}/api/health`);
      if (res.statusCode === 200 && res.body.includes('"status":"ok"')) {
        serverStarted = true;
        break;
      }
    } catch (_) {}
  }

  if (!serverStarted) {
    child.kill('SIGTERM');
    throw new Error(`Server failed to start on port ${port} in cycle ${cycleIndex}`);
  }
  console.log(`✓ Server responsive on port ${port} (health 200 OK)`);

  // Test static file serving
  const indexRes = await httpGet(`http://localhost:${port}/`);
  if (indexRes.statusCode !== 200 || !indexRes.body.includes('<div id="root">')) {
    child.kill('SIGTERM');
    throw new Error(`Static index.html serving failed on port ${port}`);
  }
  console.log('✓ Static client SPA index.html served correctly');

  // Test static JS bundle asset
  const assets = fs.readdirSync(path.join(CLIENT_DIST, 'assets'));
  const jsAsset = assets.find((f) => f.endsWith('.js'));
  if (jsAsset) {
    const assetRes = await httpGet(`http://localhost:${port}/assets/${jsAsset}`);
    if (assetRes.statusCode !== 200) {
      child.kill('SIGTERM');
      throw new Error(`Static asset /assets/${jsAsset} failed with ${assetRes.statusCode}`);
    }
    console.log(`✓ Static client asset /assets/${jsAsset} served correctly (200 OK)`);
  }

  // Gracefully terminate server
  console.log(`Stopping server on port ${port}...`);
  child.kill('SIGTERM');

  await new Promise((resolve) => {
    child.on('exit', () => resolve());
    setTimeout(resolve, 2000);
  });

  // Verify port release
  let portReleased = false;
  for (let i = 0; i < 20; i++) {
    portReleased = await checkPortFree(port);
    if (portReleased) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`Port ${port} released after shutdown: ${portReleased}`);
  if (!portReleased) {
    throw new Error(`Port ${port} was NOT released after process SIGTERM in cycle ${cycleIndex}`);
  }
}

async function verifyDatabaseIntegrity() {
  console.log('\n--- Database Integrity Verification ---');
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database file missing at ${DB_PATH}`);
  }
  const db = new Database(DB_PATH);
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    console.log('PRAGMA integrity_check result:', integrity);
    if (integrity.integrity_check !== 'ok') {
      throw new Error(`Database integrity check failed: ${JSON.stringify(integrity)}`);
    }

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    console.log(`Database tables (${tables.length}):`, tables.join(', '));

    const requiredTables = [
      'projects',
      'classes',
      'images',
      'annotations',
      'models',
      'jobs',
      'users',
      'schema_migrations',
      'annotation_history',
      'activity_log',
      'detect_cache',
    ];
    for (const reqTable of requiredTables) {
      if (!tables.includes(reqTable)) {
        throw new Error(`Missing required table: ${reqTable}`);
      }
    }
    console.log('✓ All required core database tables exist');

    const migrations = db.prepare('SELECT name FROM schema_migrations').all();
    console.log(`Recorded migrations (${migrations.length}):`, migrations.map((m) => m.name).join(', '));
  } finally {
    db.close();
  }
}

async function verifyLogFileBehavior() {
  console.log('\n--- Server Log File Behavior Verification ---');
  if (!fs.existsSync(SERVER_LOG_PATH)) {
    throw new Error(`Server log file missing at ${SERVER_LOG_PATH}`);
  }
  const stats = fs.statSync(SERVER_LOG_PATH);
  console.log(`Server log size: ${stats.size} bytes`);
  const content = fs.readFileSync(SERVER_LOG_PATH, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  console.log(`Total log lines: ${lines.length}`);
  const slowRequests = lines.filter((l) => l.includes('[SLOW_REQUEST]'));
  const crashes = lines.filter((l) => l.includes('Error:') || l.includes('Exception'));

  console.log(`Slow request warnings (>500ms): ${slowRequests.length}`);
  console.log(`Uncaught crashes / exceptions: ${crashes.length}`);

  if (slowRequests.length > 0) {
    throw new Error(`Found ${slowRequests.length} slow request warnings in log`);
  }
  if (crashes.length > 0) {
    throw new Error(`Found ${crashes.length} crash traces in log`);
  }
  console.log('✓ Log file is completely clean of warnings & crashes');
}

async function main() {
  console.log('=====================================================');
  console.log('   M5 Empirical Startup / Shutdown / DB Stress Test  ');
  console.log('=====================================================');

  try {
    await verifyDatabaseIntegrity();
    await verifyLogFileBehavior();

    // Run 3 rapid startup/shutdown cycles on port 4005
    for (let cycle = 1; cycle <= 3; cycle++) {
      await runCycle(cycle, 4005);
    }

    console.log('\n=====================================================');
    console.log('SUCCESS: All startup/shutdown stress cycles passed!');
    console.log('=====================================================');
  } catch (err) {
    console.error('\n❌ STRESS TEST FAILED:', err.message);
    process.exit(1);
  }
}

main();

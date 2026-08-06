import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TEST_PORT = 4321;
const BASE = `http://localhost:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(ROOT, 'temp', 'm1-r2-sanitization-data');

async function run() {
  console.log('=== Comprehensive Query Parameter Sanitization Re-Verification ===\n');

  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  const proc = spawn('node', ['server/src/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      DATA_DIR: TEST_DATA_DIR,
      AUTH_BOOTSTRAP_ADMIN_USER: 'admin',
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: 'kztek@2026',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let started = false;
  proc.stdout.on('data', (d) => {
    if (d.toString().includes('running at')) started = true;
  });

  for (let i = 0; i < 40; i++) {
    if (started) break;
    await sleep(250);
  }

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'kztek@2026' }),
  });
  const { token } = await loginRes.json();

  const projRes = await fetch(`${BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sanitization Verification Project' }),
  });
  const proj = await projRes.json();

  const testCases = [
    { name: '1. page=abc', query: 'page=abc', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '2. limit=xyz', query: 'limit=xyz', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '3. page=abc & limit=xyz', query: 'page=abc&limit=xyz', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '4. page=-5', query: 'page=-5', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '5. limit=0', query: 'limit=0', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '6. page=-5 & limit=0', query: 'page=-5&limit=0', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '7. page=1.5', query: 'page=1.5', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '8. limit=10.8', query: 'limit=10.8', expectedStatus: 200, expectedPage: 1, expectedLimit: 10 },
    { name: '9. page=999999999', query: 'page=999999999', expectedStatus: 200, expectedPage: 999999999, expectedLimit: 50 },
    { name: '10. limit=999999999', query: 'limit=999999999', expectedStatus: 200, expectedPage: 1, expectedLimit: 200 },
    { name: '11. page=0', query: 'page=0', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '12. page=empty', query: 'page=', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '13. limit=empty', query: 'limit=', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '14. page=NaN', query: 'page=NaN', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '15. page=Infinity', query: 'page=Infinity', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '16. page=-Infinity', query: 'page=-Infinity', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '17. page=null', query: 'page=null', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '18. page array (page=1&page=2)', query: 'page=1&page=2', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '19. limit object (limit[foo]=bar)', query: 'limit[foo]=bar', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
    { name: '20. negative limit (limit=-100)', query: 'limit=-100', expectedStatus: 200, expectedPage: 1, expectedLimit: 50 },
  ];

  let passCount = 0;
  let failCount = 0;
  const results = [];

  for (const tc of testCases) {
    const url = `${BASE}/api/projects/${proj.id}/images?${tc.query}`;
    let res;
    let body;
    let errOccurred = null;

    try {
      res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      body = await res.json();
    } catch (e) {
      errOccurred = e.message;
    }

    if (errOccurred || !res) {
      console.log(`✗ ${tc.name} -> FETCH ERROR: ${errOccurred}`);
      failCount++;
      results.push({ ...tc, actualStatus: 500, error: errOccurred, pass: false });
      continue;
    }

    const statusMatch = res.status === tc.expectedStatus;
    const pageMatch = body.page === tc.expectedPage;
    const limitMatch = body.limit === tc.expectedLimit;
    const isNaNFree = !isNaN(body.page) && !isNaN(body.limit) && !isNaN(body.totalPages) && !isNaN(body.total);

    const isPass = statusMatch && pageMatch && limitMatch && isNaNFree;

    if (isPass) {
      console.log(`✓ ${tc.name} -> HTTP ${res.status} | page=${body.page}, limit=${body.limit}, totalPages=${body.totalPages}, total=${body.total}`);
      passCount++;
    } else {
      console.log(`✗ ${tc.name} -> HTTP ${res.status} (exp ${tc.expectedStatus}) | page=${body.page} (exp ${tc.expectedPage}), limit=${body.limit} (exp ${tc.expectedLimit}), isNaNFree=${isNaNFree}`);
      failCount++;
    }

    results.push({
      ...tc,
      actualStatus: res.status,
      actualPage: body.page,
      actualLimit: body.limit,
      actualTotalPages: body.totalPages,
      actualTotal: body.total,
      pass: isPass,
    });
  }

  proc.kill('SIGTERM');
  await sleep(500);

  console.log(`\n====================================================`);
  console.log(`Sanitization Test Summary: ${passCount}/${testCases.length} Passed, ${failCount} Failed`);
  console.log(`====================================================`);

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

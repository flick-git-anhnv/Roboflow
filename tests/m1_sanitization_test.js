import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_PORT = 4108;
const BASE = `http://localhost:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(ROOT, 'temp', 'm1-sanitization-test-data');

async function run() {
  console.log('=== Query Parameter Sanitization Test ===\n');
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
    body: JSON.stringify({ name: 'Sanitization Project' }),
  });
  const proj = await projRes.json();

  // Test ?page=abc&limit=xyz
  const res1 = await fetch(`${BASE}/api/projects/${proj.id}/images?page=abc&limit=xyz`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  console.log('GET ?page=abc&limit=xyz status:', res1.status);
  const data1 = await res1.json();
  console.log('data1 page:', data1.page, 'limit:', data1.limit, 'totalPages:', data1.totalPages);

  // Test ?page=-5&limit=0
  const res2 = await fetch(`${BASE}/api/projects/${proj.id}/images?page=-5&limit=0`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  console.log('GET ?page=-5&limit=0 status:', res2.status);
  const data2 = await res2.json();
  console.log('data2 page:', data2.page, 'limit:', data2.limit, 'totalPages:', data2.totalPages);

  proc.kill('SIGTERM');
  await sleep(500);

  if (res1.status === 200 && data1.page === 1 && data1.limit === 50 &&
      res2.status === 200 && data2.page === 1 && data2.limit === 50) {
    console.log('\n✓ Query Sanitization Test PASSED');
  } else {
    console.error('\n✗ Query Sanitization Test FAILED');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

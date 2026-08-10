/**
 * Integration Test for Milestone 1: DB Migrations, Server Performance & Dashboard/Reports APIs
 * Run: node tests/m1_backend.test.js
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_PORT = 4100;
const BASE = `http://localhost:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(ROOT, 'temp', 'm1-test-data');

const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_PNG_BUF = Buffer.from(TINY_PNG_B64, 'base64');

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
    failures.push({ label, detail });
  }
}

async function request(method, pathUrl, body = null, token = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let b = null;

  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    b = JSON.stringify(body);
  } else {
    b = body;
  }

  const res = await fetch(`${BASE}${pathUrl}`, { method, headers, body: b });
  return res;
}

async function run() {
  console.log('=== Milestone 1 Integration Tests ===\n');

  // Clean temp directory
  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch (_) {}
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  // 1. Direct DB Migration Runner Test
  console.log('── 1. DB Migration Runner Verification ──');
  process.env.DATA_DIR = TEST_DATA_DIR;
  const { db } = await import('../server/src/db.js');

  const appliedMigrations = db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name);
  ok('schema_migrations contains 001_create_jobs.sql', appliedMigrations.includes('001_create_jobs.sql'));
  ok('schema_migrations contains 002_add_file_hash_and_indexes.sql', appliedMigrations.includes('002_add_file_hash_and_indexes.sql'));

  const imageCols = db.prepare("PRAGMA table_info('images')").all().map((c) => c.name);
  ok('images table has file_hash column', imageCols.includes('file_hash'));

  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((i) => i.name);
  ok('idx_images_project_status_split index exists', indexes.includes('idx_images_project_status_split'));
  ok('idx_annotations_class_image index exists', indexes.includes('idx_annotations_class_image'));
  ok('idx_activity_log_proj_created index exists', indexes.includes('idx_activity_log_proj_created'));
  db.close();

  // 2. Start Test Server
  console.log('\n── 2. Starting Server & Auth Setup ──');
  const proc = spawn('node', ['server/src/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      DATA_DIR: TEST_DATA_DIR,
      AUTH_BOOTSTRAP_ADMIN_USER: 'admin',
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: 'kztek@2026',
      SLOW_REQUEST_THRESHOLD_MS: '100',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverStarted = false;
  proc.stdout.on('data', (d) => {
    if (d.toString().includes('running at')) serverStarted = true;
  });

  for (let i = 0; i < 40; i++) {
    if (serverStarted) break;
    await sleep(250);
  }

  // Health check
  const healthRes = await request('GET', '/api/health');
  ok('Server health check → 200', healthRes.status === 200);

  // Login admin
  const loginRes = await request('POST', '/api/auth/login', { username: 'admin', password: 'kztek@2026' });
  const loginData = await loginRes.json();
  const token = loginData.token;
  ok('Admin login → token received', !!token);

  // 3. Test Dashboard Overview Endpoint
  console.log('\n── 3. Dashboard Overview API ──');
  const overviewRes = await request('GET', '/api/dashboard/overview', null, token);
  let ovText = '';
  if (overviewRes.status !== 200) ovText = await overviewRes.text();
  ok('GET /api/dashboard/overview → 200', overviewRes.status === 200, `got ${overviewRes.status} ${ovText}`);
  if (overviewRes.status === 200) {
    const data = await overviewRes.json();
    ok('Overview returns totalProjects', typeof data.totalProjects === 'number');
    ok('Overview returns totalImages', typeof data.totalImages === 'number');
    ok('Overview returns totalAnnotations', typeof data.totalAnnotations === 'number');
    ok('Overview returns totalUsers', typeof data.totalUsers === 'number');
    ok('Overview returns globalCompletionPercent', typeof data.globalCompletionPercent === 'number');
    ok('Overview returns recentActivity array', Array.isArray(data.recentActivity));
  }

  // 4. Create Project and Upload Data
  console.log('\n── 4. Project Creation & Data Upload ──');
  const createProjRes = await request('POST', '/api/projects', { name: 'M1 Test Project', description: 'Test' }, token);
  const proj = await createProjRes.json();
  const PID = proj.id;
  ok('POST /api/projects → project created', !!PID);

  // Upload image using FormData
  const formData = new FormData();
  formData.append('images', new Blob([TINY_PNG_BUF], { type: 'image/png' }), 'test1.png');
  formData.append('images', new Blob([TINY_PNG_BUF], { type: 'image/png' }), 'test2.png');
  const uploadRes = await request('POST', `/api/projects/${PID}/images/upload`, formData, token);
  ok('POST /api/projects/:pid/images/upload → 201', uploadRes.status === 201);
  const uploadedImages = await uploadRes.json();
  ok('2 images uploaded', uploadedImages.length === 2);
  ok('Uploaded image has file_hash', typeof uploadedImages[0].file_hash === 'string' && uploadedImages[0].file_hash.length > 0);

  // Mark 1 image done
  const markDoneRes = await request('POST', `/api/projects/${PID}/images/${uploadedImages[0].id}/mark-done`, {}, token);
  ok('Mark image done → 200', markDoneRes.status === 200);

  // 5. Test Project Dashboard & Reports APIs
  console.log('\n── 5. Project Dashboard & Reports APIs ──');
  const projDashRes = await request('GET', `/api/projects/${PID}/dashboard`, null, token);
  let pdText = '';
  if (projDashRes.status !== 200) pdText = await projDashRes.text();
  ok('GET /api/projects/:pid/dashboard → 200', projDashRes.status === 200, `got ${projDashRes.status} ${pdText}`);
  if (projDashRes.status === 200) {
    const pd = await projDashRes.json();
    ok('Project dashboard totalImages = 2', pd.totalImages === 2);
    ok('Project dashboard completedImages = 1', pd.completedImages === 1);
    ok('Project dashboard has reviewStatusBreakdown', typeof pd.reviewStatusBreakdown === 'object');
    ok('Project dashboard has datasetBalance', typeof pd.datasetBalance === 'object');
    ok('Project dashboard has userProductivity', Array.isArray(pd.userProductivity));
  }

  const reportsUsersRes = await request('GET', `/api/projects/${PID}/reports/users`, null, token);
  ok('GET /api/projects/:pid/reports/users → 200', reportsUsersRes.status === 200);
  if (reportsUsersRes.status === 200) {
    const usersRep = await reportsUsersRes.json();
    ok('Reports users returns array', Array.isArray(usersRep));
    ok('User report item has speedAvg', usersRep.length > 0 && typeof usersRep[0].speedAvg === 'number');
  }

  const reportsTimelineRes = await request('GET', `/api/projects/${PID}/reports/timeline?days=7`, null, token);
  ok('GET /api/projects/:pid/reports/timeline → 200', reportsTimelineRes.status === 200);
  if (reportsTimelineRes.status === 200) {
    const tlRep = await reportsTimelineRes.json();
    ok('Timeline report returns array', Array.isArray(tlRep));
  }

  // Test Export JSON
  const exportJsonRes = await request('GET', `/api/projects/${PID}/reports/export?format=json`, null, token);
  ok('GET /api/projects/:pid/reports/export?format=json → 200', exportJsonRes.status === 200);
  if (exportJsonRes.status === 200) {
    const jsonRep = await exportJsonRes.json();
    ok('Export JSON contains project', jsonRep.project && jsonRep.project.id === PID);
    ok('Export JSON contains userProductivity', Array.isArray(jsonRep.userProductivity));
  }

  // Test Export CSV
  const exportCsvRes = await request('GET', `/api/projects/${PID}/reports/export?format=csv`, null, token);
  ok('GET /api/projects/:pid/reports/export?format=csv → 200', exportCsvRes.status === 200);
  if (exportCsvRes.status === 200) {
    const csvText = await exportCsvRes.text();
    ok('CSV export header contains text/csv', exportCsvRes.headers.get('content-type').includes('text/csv'));
    ok('CSV contains User Productivity Report section', csvText.includes('[User Productivity Report]'));
    ok('CSV contains Timeline Summary Report section', csvText.includes('[Timeline Summary Report]'));
  }

  // 6. Test Paginated Images API
  console.log('\n── 6. Paginated & Filtered Images API ──');
  const page1Res = await request('GET', `/api/projects/${PID}/images?page=1&limit=1`, null, token);
  ok('GET /api/projects/:pid/images?page=1&limit=1 → 200', page1Res.status === 200);
  if (page1Res.status === 200) {
    const pageData = await page1Res.json();
    ok('Paginated response returns total = 2', pageData.total === 2);
    ok('Paginated response returns page = 1', pageData.page === 1);
    ok('Paginated response returns limit = 1', pageData.limit === 1);
    ok('Paginated response returns totalPages = 2', pageData.totalPages === 2);
    ok('Paginated response returns 1 image in images array', pageData.images.length === 1);
  }

  const completedFilterRes = await request('GET', `/api/projects/${PID}/images?completed=true`, null, token);
  ok('GET /api/projects/:pid/images?completed=true → 200', completedFilterRes.status === 200);
  if (completedFilterRes.status === 200) {
    const filteredImgs = await completedFilterRes.json();
    const arr = Array.isArray(filteredImgs) ? filteredImgs : filteredImgs.images;
    ok('Completed filter returns 1 image', arr.length === 1);
  }

  // 7. Cleanup & Stop Server
  console.log('\n── 7. Server Shutdown ──');
  proc.kill('SIGTERM');
  await sleep(500);

  // Summary
  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    console.error('FAILURES:', failures);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

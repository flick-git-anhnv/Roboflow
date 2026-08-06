/**
 * Challenger Empirical Verification & Stress Test Suite for M1
 * Target: Backend Performance & Dashboard APIs
 * Author: Challenger Subagent
 * Run: node tests/m1_challenger_stress.test.js
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_PORT = 4200;
const BASE = `http://localhost:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(ROOT, 'temp', 'm1-challenger-data');

const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_PNG_BUF = Buffer.from(TINY_PNG_B64, 'base64');

let passed = 0;
let failed = 0;
const failures = [];
const observations = [];

function record(section, condition, message, detail = '') {
  const isPass = Boolean(condition);
  if (isPass) {
    console.log(`  ✓ [${section}] ${message}`);
    passed++;
  } else {
    console.log(`  ✗ [${section}] ${message}${detail ? ': ' + detail : ''}`);
    failed++;
    failures.push({ section, message, detail });
  }
  observations.push({ section, isPass, message, detail });
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
  console.log('====================================================');
  console.log('  CHALLENGER EMPIRICAL VERIFICATION & STRESS TEST   ');
  console.log('====================================================\n');

  // Clean temp directory
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  process.env.DATA_DIR = TEST_DATA_DIR;

  // ----------------------------------------------------
  // SECTION 1: Fresh DB Edge Case & Health Check Setup
  // ----------------------------------------------------
  console.log('── Section 1: Server Startup & Fresh DB Verification ──');
  
  const serverProc = spawn('node', ['server/src/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      DATA_DIR: TEST_DATA_DIR,
      AUTH_BOOTSTRAP_ADMIN_USER: 'admin',
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: 'kztek@2026',
      SLOW_REQUEST_THRESHOLD_MS: '200',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverReady = false;
  serverProc.stdout.on('data', (d) => {
    if (d.toString().includes('running at')) serverReady = true;
  });

  for (let i = 0; i < 40; i++) {
    if (serverReady) break;
    await sleep(250);
  }

  const healthRes = await request('GET', '/api/health');
  record('FreshDB', healthRes.status === 200, 'Health check endpoint returns 200');

  const loginRes = await request('POST', '/api/auth/login', { username: 'admin', password: 'kztek@2026' });
  const loginData = await loginRes.json();
  const token = loginData.token;
  record('FreshDB', !!token, 'Admin login successful');

  // Test /api/dashboard/overview on Fresh DB (0 projects, 0 images, 0 annotations, 1 admin user)
  const freshOverviewRes = await request('GET', '/api/dashboard/overview', null, token);
  if (freshOverviewRes.status === 200) {
    const data = await freshOverviewRes.json();
    record('FreshDB', data.totalProjects === 0, 'Overview totalProjects is 0 on fresh DB', `got ${data.totalProjects}`);
    record('FreshDB', data.totalImages === 0, 'Overview totalImages is 0 on fresh DB', `got ${data.totalImages}`);
    record('FreshDB', data.totalAnnotations === 0, 'Overview totalAnnotations is 0 on fresh DB', `got ${data.totalAnnotations}`);
    record('FreshDB', data.totalUsers === 1, 'Overview totalUsers is 1 (bootstrap admin) on fresh DB', `got ${data.totalUsers}`);
    record('FreshDB', data.globalCompletionPercent === 0, 'Overview globalCompletionPercent is 0 (no division by zero)', `got ${data.globalCompletionPercent}`);
    record('FreshDB', Array.isArray(data.recentActivity) && data.recentActivity.length === 0, 'Overview recentActivity is empty array', `got length ${data.recentActivity?.length}`);
  } else {
    record('FreshDB', false, 'GET /api/dashboard/overview on fresh DB returned ' + freshOverviewRes.status);
  }

  // ----------------------------------------------------
  // SECTION 2: Project Setup & Image Query Verification
  // ----------------------------------------------------
  console.log('\n── Section 2: Image API Pagination, Filter & Invalid Param Harness ──');
  
  const createProjRes = await request('POST', '/api/projects', { name: 'Stress Test Project', description: 'Challenger' }, token);
  const proj = await createProjRes.json();
  const PID = proj.id;
  record('ImagesAPI', !!PID, `Created project ${PID}`);

  // Test export endpoints on empty project (0 images, 0 annotations)
  const emptyExportJsonRes = await request('GET', `/api/projects/${PID}/reports/export?format=json`, null, token);
  record('ExportAPI', emptyExportJsonRes.status === 200, 'Export JSON on empty project returns 200');
  if (emptyExportJsonRes.status === 200) {
    const ej = await emptyExportJsonRes.json();
    record('ExportAPI', Array.isArray(ej.userProductivity) && ej.userProductivity.length >= 1, 'Empty export JSON contains user productivity array');
  }

  const emptyExportCsvRes = await request('GET', `/api/projects/${PID}/reports/export?format=csv`, null, token);
  record('ExportAPI', emptyExportCsvRes.status === 200, 'Export CSV on empty project returns 200');
  if (emptyExportCsvRes.status === 200) {
    const csvStr = await emptyExportCsvRes.text();
    record('ExportAPI', csvStr.includes('[User Productivity Report]') && csvStr.includes('[Timeline Summary Report]'), 'Empty export CSV contains expected section headers');
  }

  // Upload small batch of images (e.g. 5 images) for param testing
  const formData = new FormData();
  for (let i = 1; i <= 5; i++) {
    formData.append('images', new Blob([TINY_PNG_BUF], { type: 'image/png' }), `img_${i}.png`);
  }
  const uploadRes = await request('POST', `/api/projects/${PID}/images/upload`, formData, token);
  const uploaded = await uploadRes.json();
  record('ImagesAPI', Array.isArray(uploaded) && uploaded.length === 5, 'Uploaded 5 test images');

  // Mark 2 images as done, set split values explicitly
  await request('POST', `/api/projects/${PID}/images/${uploaded[0].id}/mark-done`, {}, token);
  await request('POST', `/api/projects/${PID}/images/${uploaded[1].id}/mark-done`, {}, token);
  await request('PATCH', `/api/projects/${PID}/images/${uploaded[0].id}`, { split: 'train' }, token);
  await request('PATCH', `/api/projects/${PID}/images/${uploaded[1].id}`, { split: 'valid' }, token);
  await request('PATCH', `/api/projects/${PID}/images/${uploaded[2].id}`, { split: 'test' }, token);
  await request('PATCH', `/api/projects/${PID}/images/${uploaded[3].id}`, { split: 'test' }, token);
  await request('PATCH', `/api/projects/${PID}/images/${uploaded[4].id}`, { split: 'test' }, token);

  // --- Subtest 2.1: Pagination Boundary & Invalid Params ---
  console.log('\n  Subtest 2.1: Pagination Boundary & Invalid Params');

  // Normal paginated request
  const resNorm = await request('GET', `/api/projects/${PID}/images?page=1&limit=2`, null, token);
  const dataNorm = await resNorm.json();
  record('Paginate', resNorm.status === 200 && dataNorm.images.length === 2 && dataNorm.total === 5 && dataNorm.totalPages === 3, 'Standard pagination page=1 limit=2');

  // Limit clamping max check (limit=1000 should clamp to 200)
  const resLimitMax = await request('GET', `/api/projects/${PID}/images?page=1&limit=1000`, null, token);
  const dataLimitMax = await resLimitMax.json();
  record('Paginate', resLimitMax.status === 200 && dataLimitMax.limit === 200, 'Limit 1000 is clamped to 200');

  // Limit clamping min check (limit=0 should clamp to 1)
  const resLimitMin = await request('GET', `/api/projects/${PID}/images?page=1&limit=0`, null, token);
  const dataLimitMin = await resLimitMin.json();
  record('Paginate', resLimitMin.status === 200 && dataLimitMin.limit === 1, 'Limit 0 is clamped to 1');

  // Negative limit check (limit=-50 should clamp to 1)
  const resLimitNeg = await request('GET', `/api/projects/${PID}/images?page=1&limit=-50`, null, token);
  const dataLimitNeg = await resLimitNeg.json();
  record('Paginate', resLimitNeg.status === 200 && dataLimitNeg.limit === 1, 'Limit -50 is clamped to 1');

  // Negative page check (page=-5 should clamp to 1)
  const resPageNeg = await request('GET', `/api/projects/${PID}/images?page=-5&limit=2`, null, token);
  const dataPageNeg = await resPageNeg.json();
  record('Paginate', resPageNeg.status === 200 && dataPageNeg.page === 1, 'Page -5 is clamped to 1');

  // Page out of bounds check (page=9999)
  const resPageOOB = await request('GET', `/api/projects/${PID}/images?page=9999&limit=2`, null, token);
  const dataPageOOB = await resPageOOB.json();
  record('Paginate', resPageOOB.status === 200 && dataPageOOB.images.length === 0 && dataPageOOB.total === 5, 'Page 9999 returns empty array without error');

  // Invalid non-numeric page parameter (page=abc)
  const resPageNaN = await request('GET', `/api/projects/${PID}/images?page=abc&limit=2`, null, token);
  if (resPageNaN.status === 200) {
    const dataPageNaN = await resPageNaN.json();
    record('Paginate', dataPageNaN.page === 1, `page=abc handled gracefully (returned page ${dataPageNaN.page})`);
  } else {
    record('Paginate', false, `page=abc returned HTTP ${resPageNaN.status} (expected HTTP 200 with fallback to page=1 or 400 Bad Request)`);
  }

  // Invalid non-numeric limit parameter (limit=xyz)
  const resLimitNaN = await request('GET', `/api/projects/${PID}/images?page=1&limit=xyz`, null, token);
  if (resLimitNaN.status === 200) {
    const dataLimitNaN = await resLimitNaN.json();
    record('Paginate', typeof dataLimitNaN.limit === 'number' && !isNaN(dataLimitNaN.limit), `limit=xyz handled gracefully (returned limit ${dataLimitNaN.limit})`);
  } else {
    record('Paginate', false, `limit=xyz returned HTTP ${resLimitNaN.status} (expected HTTP 200 with fallback to limit=50 or 400 Bad Request)`);
  }

  // --- Subtest 2.2: Filters & Combinations ---
  console.log('\n  Subtest 2.2: Filters & Adversarial Inputs');

  const resFilterCompleted = await request('GET', `/api/projects/${PID}/images?completed=true`, null, token);
  const dataFilterCompleted = await resFilterCompleted.json();
  record('Filters', (dataFilterCompleted.images || dataFilterCompleted).length === 2, 'completed=true filter returns 2 images');

  const resFilterUncompleted = await request('GET', `/api/projects/${PID}/images?completed=false`, null, token);
  const dataFilterUncompleted = await resFilterUncompleted.json();
  record('Filters', (dataFilterUncompleted.images || dataFilterUncompleted).length === 3, 'completed=false filter returns 3 images');

  const resFilterSplit = await request('GET', `/api/projects/${PID}/images?split=train`, null, token);
  const dataFilterSplit = await resFilterSplit.json();
  record('Filters', (dataFilterSplit.images || dataFilterSplit).length === 1, 'split=train filter returns 1 image');

  const resSearch = await request('GET', `/api/projects/${PID}/images?search=img_1`, null, token);
  const dataSearch = await resSearch.json();
  record('Filters', (dataSearch.images || dataSearch).length === 1, 'search=img_1 filter returns 1 image');

  // SQL Injection resilience check
  const sqliSearch = "img_1' OR '1'='1";
  const resSqli = await request('GET', `/api/projects/${PID}/images?search=${encodeURIComponent(sqliSearch)}`, null, token);
  record('Security', resSqli.status === 200, 'SQL injection in search param does not crash server');
  if (resSqli.status === 200) {
    const dataSqli = await resSqli.json();
    const imgs = dataSqli.images || dataSqli;
    record('Security', imgs.length === 0, 'SQL injection in search param does not bypass filter');
  }

  // ----------------------------------------------------
  // SECTION 3: slowLogger Middleware Stress & Verification
  // ----------------------------------------------------
  console.log('\n── Section 3: slowLogger Middleware Testing ──');

  const logFilePath = path.join(TEST_DATA_DIR, 'server.log');

  await request('GET', '/api/health');

  // Concurrency load test: 100 concurrent requests to /api/dashboard/overview
  const reqPromises = [];
  const startLoad = Date.now();
  for (let i = 0; i < 100; i++) {
    reqPromises.push(request('GET', '/api/dashboard/overview', null, token));
  }
  const responses = await Promise.all(reqPromises);
  const loadDuration = Date.now() - startLoad;
  const all200 = responses.every((r) => r.status === 200);

  record('SlowLogger', all200, `Handled 100 concurrent requests in ${loadDuration}ms (all HTTP 200)`);

  await sleep(300);

  let logContentAfter = fs.existsSync(logFilePath) ? fs.readFileSync(logFilePath, 'utf8') : '';
  const slowCountAfter = (logContentAfter.match(/\[SLOW_REQUEST\]/g) || []).length;

  record('SlowLogger', fs.existsSync(logFilePath), `server.log created and functional (slow requests recorded: ${slowCountAfter})`);

  // ----------------------------------------------------
  // SECTION 4: Large Database Load & Performance Stress Test
  // ----------------------------------------------------
  console.log('\n── Section 4: Large Dataset Stress Test (5,000+ Records) ──');

  const { db: directDb } = await import('../server/src/db.js');

  const LARGE_PROJ_ID = 'proj_large_stress_test';
  directDb.prepare("INSERT INTO projects (id, name, description) VALUES (?, ?, ?)").run(LARGE_PROJ_ID, 'Large Scale Project', 'Stress test dataset');

  // Seed 5,000 images and 20,000 annotations in a transaction
  console.log('  Seeding 5,000 images and 20,000 annotations into SQLite...');
  const seedStart = Date.now();
  
  const insertClass = directDb.prepare("INSERT INTO classes (id, project_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)");
  for (let c = 1; c <= 5; c++) {
    insertClass.run(`cls_${c}`, LARGE_PROJ_ID, `Class_${c}`, '#FF0000', c);
  }

  const insertImg = directDb.prepare(`
    INSERT INTO images (id, project_id, filename, original_name, width, height, status, split, completed_at, completed_by, uploaded_by, file_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAnn = directDb.prepare(`
    INSERT INTO annotations (id, image_id, class_id, x, y, w, h)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const splits = ['train', 'valid', 'test'];

  const seedTransaction = directDb.transaction(() => {
    for (let i = 1; i <= 5000; i++) {
      const imgId = `img_large_${i}`;
      const status = i % 2 === 0 ? 'labeled' : 'unlabeled';
      const split = splits[i % 3];
      const completedAt = i % 2 === 0 ? new Date().toISOString() : null;
      const completedBy = i % 2 === 0 ? 1 : null;
      const fileHash = `hash_${i % 100}`;

      insertImg.run(
        imgId,
        LARGE_PROJ_ID,
        `file_${i}.png`,
        `orig_${i}.png`,
        1920,
        1080,
        status,
        split,
        completedAt,
        completedBy,
        1,
        fileHash
      );

      for (let a = 1; a <= 4; a++) {
        const annId = `ann_${i}_${a}`;
        const classId = `cls_${(a % 5) + 1}`;
        insertAnn.run(annId, imgId, classId, 10, 10, 100, 100);
      }
    }
  });

  seedTransaction();
  const seedTime = Date.now() - seedStart;
  console.log(`  ✓ Seeded 5,000 images & 20,000 annotations in ${seedTime}ms.`);

  // Benchmark Dashboard Overview on Large DB
  const t0 = Date.now();
  const largeOverviewRes = await request('GET', '/api/dashboard/overview', null, token);
  const t0_dur = Date.now() - t0;
  record('LargeDB', largeOverviewRes.status === 200, `GET /api/dashboard/overview response time: ${t0_dur}ms`);
  if (largeOverviewRes.status === 200) {
    const ov = await largeOverviewRes.json();
    record('LargeDB', ov.totalImages >= 5005, `Overview returns totalImages = ${ov.totalImages}`);
    record('LargeDB', ov.totalAnnotations >= 20000, `Overview returns totalAnnotations = ${ov.totalAnnotations}`);
    record('LargeDB', t0_dur < 500, `Overview response time < 500ms (actual: ${t0_dur}ms)`);
  }

  // Benchmark Project Dashboard API on Large DB
  const t1 = Date.now();
  const largeProjDashRes = await request('GET', `/api/projects/${LARGE_PROJ_ID}/dashboard`, null, token);
  const t1_dur = Date.now() - t1;
  record('LargeDB', largeProjDashRes.status === 200, `GET /api/projects/:pid/dashboard response time: ${t1_dur}ms`);
  if (largeProjDashRes.status === 200) {
    const pd = await largeProjDashRes.json();
    record('LargeDB', pd.totalImages === 5000, `Project dashboard totalImages = ${pd.totalImages}`);
    record('LargeDB', pd.labeledImages === 2500, `Project dashboard labeledImages = ${pd.labeledImages}`);
    record('LargeDB', pd.totalAnnotations === 20000, `Project dashboard totalAnnotations = ${pd.totalAnnotations}`);
    record('LargeDB', t1_dur < 500, `Project dashboard response time < 500ms (actual: ${t1_dur}ms)`);
  }

  // Benchmark Paginated Image Query on 5,000 images (page=1 limit=50)
  const t2 = Date.now();
  const largeImgPageRes = await request('GET', `/api/projects/${LARGE_PROJ_ID}/images?page=1&limit=50`, null, token);
  const t2_dur = Date.now() - t2;
  record('LargeDB', largeImgPageRes.status === 200, `GET /api/projects/:pid/images?page=1&limit=50 response time: ${t2_dur}ms`);
  if (largeImgPageRes.status === 200) {
    const pData = await largeImgPageRes.json();
    record('LargeDB', pData.total === 5000 && pData.totalPages === 100 && pData.images.length === 50, 'Paginated query returns 50 images and totalPages=100');
    record('LargeDB', t2_dur < 100, `Paginated image query response time < 100ms (actual: ${t2_dur}ms)`);
  }

  // Benchmark Report Export endpoints on Large DB
  const t3 = Date.now();
  const largeExportJsonRes = await request('GET', `/api/projects/${LARGE_PROJ_ID}/reports/export?format=json`, null, token);
  const t3_dur = Date.now() - t3;
  record('LargeDB', largeExportJsonRes.status === 200, `Export JSON (5,000 imgs) response time: ${t3_dur}ms`);

  const t4 = Date.now();
  const largeExportCsvRes = await request('GET', `/api/projects/${LARGE_PROJ_ID}/reports/export?format=csv`, null, token);
  const t4_dur = Date.now() - t4;
  record('LargeDB', largeExportCsvRes.status === 200, `Export CSV (5,000 imgs) response time: ${t4_dur}ms`);

  // ----------------------------------------------------
  // SECTION 5: Teardown & Summary
  // ----------------------------------------------------
  console.log('\n── Section 5: Shutdown & Test Summary ──');
  serverProc.kill('SIGTERM');
  await sleep(500);

  console.log('\n====================================================');
  console.log(`  FINAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    console.error('FAILURES UNCOVERED BY CHALLENGER:');
    for (const f of failures) {
      console.error(`- [${f.section}] ${f.message}: ${f.detail}`);
    }
  }
}

run().catch((err) => {
  console.error('Stress test runner encountered fatal error:', err);
  process.exit(1);
});

/**
 * Auth Integration Test — covers every row in AD-A5 matrix (CTO condition #A1).
 * Chạy: node tests/auth.test.js
 * Yêu cầu: Node 18+ (built-in fetch). Server tự start/stop trong test.
 *
 * Ma trận kiểm tra:
 *  Row 1:  GET resources → all roles 200, unauthenticated 401
 *  Row 2:  PUT annotations → all roles 200, unauthenticated 401
 *  Row 3:  Upload images → all roles 200, unauthenticated 401
 *  Row 4:  Delete image SELF → annotator:self 204, annotator:other 403, reviewer/admin any 204
 *  Row 5:  Mark "Done" (status=labeled) → all roles 200
 *  Row 6:  Un-mark "Done" for others → annotator 403, reviewer/admin 200
 *  Row 7:  Revert history (Phase 3) → annotator 403, reviewer/admin 200 (STEP-3.2)
 *  Row 8:  Review workflow (Phase 2.3) → implemented STEP-2.3
 *  Row 9:  CRUD classes → all roles 200
 *  Row 10: CRUD models (upload/delete) → annotator 403, reviewer/admin 200/204
 *  Row 11: Auto-label → all roles 202/503 (service may be down)
 *  Row 12: Delete project → annotator 403, reviewer 403, admin 204
 *  Row 13: Create project → all roles 201
 *  Row 14: CRUD users / register → annotator 403, reviewer 403, admin 201/200
 *  Row 15: PATCH self (display_name) → all roles 200 (self); annotator change role → 403
 *  Row 16: Change role/is_active of other → annotator 403, reviewer 403, admin 200
 *  Row 20: detect_cache endpoints (STEP-4.1) → unauthenticated 401, authenticated 200
 *  Row 21: prefill bbox (STEP-4.2) → unauthenticated 401, annotator PATCH 403,
 *          no default model 422, image-with-annotations → 200 {suggestions:[]}
 *
 * Security warning tests (ADR §6.3):
 *  W1: Same error message for wrong username vs wrong password
 *  W2: algorithms:['HS256'] verified via tampered token → 401
 *  W3: Annotator cannot PATCH own role → 403
 *  W4: Login delay 150-300ms (timing test)
 *  W5: SELECT whitelist: /api/auth/me does not return password_hash
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_PORT = 4099;
const BASE = `http://localhost:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(ROOT, 'temp', 'test-data');

// ── Minimal 1×1 transparent PNG (base64) ─────────────────────────────────────
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_PNG_BUF = Buffer.from(TINY_PNG_B64, 'base64');

// ── Simple test runner ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;
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

function skip(label, reason) {
  console.log(`  ⏭  ${label} — PENDING: ${reason}`);
  skipped++;
}

async function checkStatus(label, fn, expected) {
  try {
    const res = await fn();
    ok(label, res.status === expected, `expected ${expected} got ${res.status}`);
    return res;
  } catch (e) {
    ok(label, false, e.message);
    return null;
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function h(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get(path, token) {
  return fetch(`${BASE}${path}`, { headers: h(token) });
}
async function post(path, body, token) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...h(token) },
    body: JSON.stringify(body),
  });
}
async function put(path, body, token) {
  return fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...h(token) },
    body: JSON.stringify(body),
  });
}
async function patch(path, body, token) {
  return fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...h(token) },
    body: JSON.stringify(body),
  });
}
async function del(path, token) {
  return fetch(`${BASE}${path}`, { method: 'DELETE', headers: h(token) });
}
async function delBody(path, body, token) {
  return fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...h(token) },
    body: JSON.stringify(body),
  });
}
async function uploadImage(projectId, token) {
  const form = new FormData();
  form.append('images', new Blob([TINY_PNG_BUF], { type: 'image/png' }), 'test.png');
  return fetch(`${BASE}/api/projects/${projectId}/images/upload`, {
    method: 'POST',
    headers: h(token),
    body: form,
  });
}

// ── Server lifecycle ──────────────────────────────────────────────────────────
let serverProc = null;

function startServer() {
  return new Promise((resolve, reject) => {
    // Clean test DB
    try { fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    serverProc = spawn('node', ['src/index.js'], {
      cwd: path.join(ROOT, 'server'),
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        DATA_DIR: TEST_DATA_DIR,
        AUTH_JWT_SECRET: 'test-secret-for-auth-tests-min-32-chars-xxxx',
        AUTH_BOOTSTRAP_ADMIN_USER: 'testadmin',
        AUTH_BOOTSTRAP_ADMIN_PASSWORD: 'TestAdmin123!',
        USE_LEGACY_INFER: '1',
        CORS_ORIGIN: 'http://localhost:5173',
        NODE_ENV: 'development',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let ready = false;
    serverProc.stdout.on('data', (d) => {
      const line = d.toString();
      if (process.env.VERBOSE) process.stdout.write('[server] ' + line);
      if (!ready && line.includes('running at')) {
        ready = true;
        resolve();
      }
    });
    serverProc.stderr.on('data', (d) => {
      if (process.env.VERBOSE) process.stderr.write('[server-err] ' + d.toString());
    });
    serverProc.on('error', reject);
    setTimeout(() => { if (!ready) reject(new Error('Server start timeout')); }, 20000);
  });
}

function stopServer() {
  if (serverProc) {
    serverProc.kill('SIGTERM');
    serverProc = null;
  }
}

// ── Login helper ──────────────────────────────────────────────────────────────
async function login(username, password) {
  const res = await post('/api/auth/login', { username, password }, null);
  if (res.status !== 200) throw new Error(`Login failed for ${username}: ${res.status}`);
  const data = await res.json();
  return data.token;
}

// ── Main test suite ───────────────────────────────────────────────────────────
async function runTests() {
  console.log('\nStarting test server...');
  await startServer();
  await sleep(500); // wait for bcrypt seed to complete

  // ── Setup: login as admin, create reviewer & annotator ─────────────────────
  console.log('\n── Setup ──────────────────────────────────────────────');
  const adminToken = await login('testadmin', 'TestAdmin123!');
  console.log('  Admin token obtained ✓');

  // Create reviewer user
  const createReviewer = await post('/api/users', {
    username: 'testreviewer',
    password: 'Reviewer123!',
    display_name: 'Test Reviewer',
    role: 'reviewer',
    color: '#2E9E6C',
  }, adminToken);
  ok('Create reviewer user (admin)', createReviewer.status === 201);
  const reviewerData = await createReviewer.json();
  const reviewerId = reviewerData.id;
  const reviewerToken = await login('testreviewer', 'Reviewer123!');
  console.log('  Reviewer token obtained ✓');

  // Create annotator user
  const createAnnotator = await post('/api/users', {
    username: 'testannotator',
    password: 'Annotator123!',
    display_name: 'Test Annotator',
    role: 'annotator',
    color: '#F05922',
  }, adminToken);
  ok('Create annotator user (admin)', createAnnotator.status === 201);
  const annotatorData = await createAnnotator.json();
  const annotatorId = annotatorData.id;
  const annotatorToken = await login('testannotator', 'Annotator123!');
  console.log('  Annotator token obtained ✓');

  // Create test project (as admin)
  const createProj = await post('/api/projects', { name: 'Test Project Auth', description: '' }, adminToken);
  ok('Create test project (admin)', createProj.status === 201);
  const proj = await createProj.json();
  const PID = proj.id;

  // Upload test image as annotator (for owner-based delete tests)
  const uploadAsAnnotator = await uploadImage(PID, annotatorToken);
  ok('Upload image as annotator', uploadAsAnnotator.status === 201);
  const annotatorImages = await uploadAsAnnotator.json();
  const annotatorImageId = annotatorImages[0]?.id;

  // Upload test image as admin (for "delete other's image" test)
  const uploadAsAdmin = await uploadImage(PID, adminToken);
  ok('Upload image as admin', uploadAsAdmin.status === 201);
  const adminImages = await uploadAsAdmin.json();
  const adminImageId = adminImages[0]?.id;

  // Get a class for annotation tests
  const classesRes = await get(`/api/projects/${PID}/classes`, adminToken);
  const classes = await classesRes.json();
  const classId = classes[0]?.id;

  console.log(`\n  Project: ${PID}, annotatorImage: ${annotatorImageId}, adminImage: ${adminImageId}`);

  // ── Row 1: GET resources — all roles 200, unauth 401 ─────────────────────
  console.log('\n── Row 1: GET resources (all roles 200, unauth 401) ──');
  await checkStatus('GET /api/projects [admin]',    () => get('/api/projects', adminToken),    200);
  await checkStatus('GET /api/projects [reviewer]', () => get('/api/projects', reviewerToken), 200);
  await checkStatus('GET /api/projects [annotator]',() => get('/api/projects', annotatorToken),200);
  await checkStatus('GET /api/projects [unauth]',   () => get('/api/projects', null),           401);
  await checkStatus(`GET images [admin]`,    () => get(`/api/projects/${PID}/images`, adminToken),    200);
  await checkStatus(`GET images [reviewer]`, () => get(`/api/projects/${PID}/images`, reviewerToken), 200);
  await checkStatus(`GET images [annotator]`,() => get(`/api/projects/${PID}/images`, annotatorToken),200);
  await checkStatus(`GET images [unauth]`,   () => get(`/api/projects/${PID}/images`, null),           401);
  await checkStatus(`GET models [admin]`,    () => get(`/api/projects/${PID}/models`, adminToken),    200);
  await checkStatus(`GET models [reviewer]`, () => get(`/api/projects/${PID}/models`, reviewerToken), 200);
  await checkStatus(`GET models [annotator]`,() => get(`/api/projects/${PID}/models`, annotatorToken),200);

  // ── Row 2: PUT annotations — all roles 200, unauth 401 ───────────────────
  console.log('\n── Row 2: PUT annotations (all roles 200, unauth 401) ──');
  const annotations = [{ class_id: classId, x: 10, y: 10, w: 50, h: 50, type: 'bbox', points: null }];
  await checkStatus('PUT annotations [admin]',    () => put(`/api/images/${annotatorImageId}/annotations`, { annotations }, adminToken),    200);
  await checkStatus('PUT annotations [reviewer]', () => put(`/api/images/${annotatorImageId}/annotations`, { annotations }, reviewerToken), 200);
  await checkStatus('PUT annotations [annotator]',() => put(`/api/images/${annotatorImageId}/annotations`, { annotations }, annotatorToken),200);
  await checkStatus('PUT annotations [unauth]',   () => put(`/api/images/${annotatorImageId}/annotations`, { annotations }, null),           401);

  // ── Row 3: Upload images — all roles 201, unauth 401 ─────────────────────
  console.log('\n── Row 3: Upload images (all roles 201, unauth 401) ──');
  await checkStatus('Upload image [admin]',    () => uploadImage(PID, adminToken),    201);
  await checkStatus('Upload image [reviewer]', () => uploadImage(PID, reviewerToken), 201);
  await checkStatus('Upload image [annotator]',() => uploadImage(PID, annotatorToken),201);
  await checkStatus('Upload image [unauth]',   () => uploadImage(PID, null),           401);

  // ── Row 4: Delete image SELF / other ─────────────────────────────────────
  console.log('\n── Row 4: Delete image (annotator:self=204, annotator:other=403, reviewer/admin=204) ──');
  await checkStatus('DELETE own image [annotator self]',  () => del(`/api/projects/${PID}/images/${annotatorImageId}`, annotatorToken), 204);
  await checkStatus('DELETE other image [annotator]',     () => del(`/api/projects/${PID}/images/${adminImageId}`,     annotatorToken), 403);
  // Upload fresh images for reviewer/admin delete tests
  const img4r = await (await uploadImage(PID, adminToken)).json();
  const img4a = await (await uploadImage(PID, adminToken)).json();
  await checkStatus('DELETE any image [reviewer]', () => del(`/api/projects/${PID}/images/${img4r[0].id}`, reviewerToken), 204);
  await checkStatus('DELETE any image [admin]',    () => del(`/api/projects/${PID}/images/${img4a[0].id}`, adminToken),    204);

  // ── Row 5: Mark "Done" (status=labeled) — all roles 200 ─────────────────
  console.log('\n── Row 5: Mark Done status=labeled (all roles 200) ──');
  await checkStatus('PATCH status=labeled [admin]',    () => patch(`/api/projects/${PID}/images/${adminImageId}`, { status: 'labeled' }, adminToken),    200);
  await checkStatus('PATCH status=labeled [reviewer]', () => patch(`/api/projects/${PID}/images/${adminImageId}`, { status: 'labeled' }, reviewerToken), 200);
  // Upload fresh annotator image for row 5
  const img5ann = await (await uploadImage(PID, annotatorToken)).json();
  await checkStatus('PATCH status=labeled [annotator, own image]', () => patch(`/api/projects/${PID}/images/${img5ann[0].id}`, { status: 'labeled' }, annotatorToken), 200);

  // ── Row 6: Un-mark "Done" of OTHER → annotator 403, reviewer/admin 200 ──
  console.log('\n── Row 6: Un-mark Done for others (annotator 403, reviewer/admin 200) ──');
  // adminImageId is labeled (set in row 5) and uploaded_by = admin != annotator
  await checkStatus('Un-mark done others [annotator → 403]',  () => patch(`/api/projects/${PID}/images/${adminImageId}`, { status: 'unlabeled' }, annotatorToken), 403);
  await checkStatus('Un-mark done any [reviewer → 200]',       () => patch(`/api/projects/${PID}/images/${adminImageId}`, { status: 'unlabeled' }, reviewerToken),  200);
  await checkStatus('Un-mark done any [admin → 200]',          () => patch(`/api/projects/${PID}/images/${adminImageId}`, { status: 'unlabeled' }, adminToken),     200);
  // Annotator can un-mark their OWN image
  await patch(`/api/projects/${PID}/images/${img5ann[0].id}`, { status: 'labeled' }, annotatorToken); // mark first
  await checkStatus('Un-mark done own [annotator self → 200]', () => patch(`/api/projects/${PID}/images/${img5ann[0].id}`, { status: 'unlabeled' }, annotatorToken), 200);

  // ── Row 7: Revert annotation history (STEP-3.2) ─────────────────────────
  console.log('\n── Row 7: Revert annotation history ──');
  // Setup: upload fresh image, save 2 annotation versions để tạo history
  const img7UploadRes = await uploadImage(PID, adminToken);
  const img7Id = (await img7UploadRes.json())[0].id;
  const ann7v1 = [{ class_id: classId, x: 10, y: 10, w: 50, h: 50, type: 'bbox', points: null }];
  const ann7v2 = [{ class_id: classId, x: 20, y: 20, w: 60, h: 60, type: 'bbox', points: null }];
  // Save version 1 → annotation_history version=1
  await put(`/api/images/${img7Id}/annotations`, { annotations: ann7v1 }, adminToken);
  // Save version 2 → annotation_history version=2 (current state)
  await put(`/api/images/${img7Id}/annotations`, { annotations: ann7v2 }, adminToken);

  // GET history để tìm version 1
  const histListRes = await get(`/api/images/${img7Id}/history`, adminToken);
  ok('GET /history [admin → 200]', histListRes.status === 200, `got ${histListRes.status}`);
  const histList = await histListRes.json();
  const v1entry = histList.find((e) => e.version === 1);
  ok('History has version 1 entry', !!v1entry, `entries: ${JSON.stringify(histList.map(e => e.version))}`);

  // annotator → 403 (AD-A5 Row 7)
  await checkStatus(
    'POST revert [annotator → 403]',
    () => post(`/api/images/${img7Id}/history/${v1entry?.version ?? 1}/revert`, {}, annotatorToken),
    403
  );

  // reviewer → 200, annotations phải khớp snapshot v1
  const revertRevRes = await post(`/api/images/${img7Id}/history/${v1entry?.version ?? 1}/revert`, {}, reviewerToken);
  ok('POST revert [reviewer → 200]', revertRevRes.status === 200, `got ${revertRevRes.status}`);
  if (revertRevRes.status === 200) {
    const revertRevBody = await revertRevRes.json();
    ok(
      'Revert reviewer — annotations match v1 snapshot (x=10)',
      Array.isArray(revertRevBody.annotations) &&
        revertRevBody.annotations.length === 1 &&
        Math.abs(revertRevBody.annotations[0].x - 10) < 0.001,
      `x=${revertRevBody.annotations?.[0]?.x}`
    );
  }

  // admin → 200 (revert lại v1 lần nữa — lúc này current là v1 do reviewer vừa revert)
  const revertAdmRes = await post(`/api/images/${img7Id}/history/${v1entry?.version ?? 1}/revert`, {}, adminToken);
  ok('POST revert [admin → 200]', revertAdmRes.status === 200, `got ${revertAdmRes.status}`);

  // ── Row 8: Review workflow (Phase 2.3) ───────────────────────────────────
  console.log('\n── Row 8: Review workflow ──');
  const img8 = await (await uploadImage(PID, annotatorToken)).json();
  const img8Id = img8[0].id;

  // STEP-3.5: mark done trước khi submit-review (IMAGE_NOT_COMPLETED gate)
  await post(`/api/projects/${PID}/images/${img8Id}/mark-done`, {}, annotatorToken);

  // annotator submits for review (own image, draft → in_review)
  await checkStatus(
    'POST submit-review [annotator → 200]',
    () => post(`/api/images/${img8Id}/submit-review`, {}, annotatorToken),
    200
  );

  // annotator cannot approve/reject (reviewer-only actions)
  await checkStatus(
    'POST approve [annotator → 403]',
    () => post(`/api/images/${img8Id}/approve`, {}, annotatorToken),
    403
  );
  await checkStatus(
    'POST reject [annotator → 403]',
    () => post(`/api/images/${img8Id}/reject`, { comment: 'x' }, annotatorToken),
    403
  );

  // reviewer approves (in_review → approved)
  await checkStatus(
    'POST approve [reviewer → 200]',
    () => post(`/api/images/${img8Id}/approve`, {}, reviewerToken),
    200
  );

  // second image: reviewer rejects with comment (in_review → rejected)
  const img8b = await (await uploadImage(PID, annotatorToken)).json();
  const img8bId = img8b[0].id;
  await post(`/api/projects/${PID}/images/${img8bId}/mark-done`, {}, annotatorToken); // STEP-3.5
  await post(`/api/images/${img8bId}/submit-review`, {}, annotatorToken);
  const rejectRes = await checkStatus(
    'POST reject [reviewer → 200]',
    () => post(`/api/images/${img8bId}/reject`, { comment: 'Cần chỉnh lại bbox' }, reviewerToken),
    200
  );
  const rejected = await rejectRes.json();
  ok(
    'Reject lưu đúng review_comment',
    rejected.review_comment === 'Cần chỉnh lại bbox',
    `got '${rejected.review_comment}'`
  );

  // admin can approve too (third image)
  const img8c = await (await uploadImage(PID, annotatorToken)).json();
  const img8cId = img8c[0].id;
  await post(`/api/projects/${PID}/images/${img8cId}/mark-done`, {}, annotatorToken); // STEP-3.5
  await post(`/api/images/${img8cId}/submit-review`, {}, annotatorToken);
  await checkStatus(
    'POST approve [admin → 200]',
    () => post(`/api/images/${img8cId}/approve`, {}, adminToken),
    200
  );

  // unauthenticated → 401
  await checkStatus(
    'POST approve [unauthenticated → 401]',
    () => post(`/api/images/${img8Id}/approve`, {}, null),
    401
  );

  // ── Row 9: CRUD classes — all roles 200/201/204 ──────────────────────────
  console.log('\n── Row 9: CRUD classes (all roles) ──');
  const createCls = async (token) => post(`/api/projects/${PID}/classes`, { name: 'TestClass', color: '#ff0000' }, token);
  const r9admin = await createCls(adminToken);
  ok('POST classes [admin 201]',    r9admin.status === 201);
  const cls9 = await r9admin.json();
  await checkStatus('PATCH classes [admin]',    () => patch(`/api/projects/${PID}/classes/${cls9.id}`, { name: 'Updated' }, adminToken),    200);

  const r9rev = await createCls(reviewerToken);
  ok('POST classes [reviewer 201]', r9rev.status === 201);
  const cls9r = await r9rev.json();
  await checkStatus('DELETE classes [reviewer]', () => del(`/api/projects/${PID}/classes/${cls9r.id}`, reviewerToken), 204);

  const r9ann = await createCls(annotatorToken);
  ok('POST classes [annotator 201]', r9ann.status === 201);
  const cls9a = await r9ann.json();
  await checkStatus('DELETE classes [annotator]', () => del(`/api/projects/${PID}/classes/${cls9a.id}`, annotatorToken), 204);

  // ── Row 10: CRUD models — annotator 403, reviewer/admin 200 ─────────────
  console.log('\n── Row 10: CRUD models (annotator 403, reviewer/admin 201/204) ──');
  async function uploadModel(token) {
    const form = new FormData();
    form.append('model', new Blob([Buffer.from('fake-pt-content')], { type: 'application/octet-stream' }), 'fake.pt');
    return fetch(`${BASE}/api/projects/${PID}/models/upload`, {
      method: 'POST',
      headers: h(token),
      body: form,
    });
  }
  await checkStatus('POST model upload [annotator → 403]',  () => uploadModel(annotatorToken), 403);
  const uploadRevRes = await uploadModel(reviewerToken);
  ok('POST model upload [reviewer → 201]', uploadRevRes.status === 201);
  const model1 = await uploadRevRes.json();
  await checkStatus('DELETE model [reviewer → 204]', () => del(`/api/projects/${PID}/models/${model1.id}`, reviewerToken), 204);

  const uploadAdmRes = await uploadModel(adminToken);
  ok('POST model upload [admin → 201]', uploadAdmRes.status === 201);
  const model2 = await uploadAdmRes.json();
  await checkStatus('DELETE model [admin → 204]', () => del(`/api/projects/${PID}/models/${model2.id}`, adminToken), 204);

  // ── Row 11: Auto-label — all roles 202 or 503 (inference service down) ──
  console.log('\n── Row 11: Auto-label (all roles allowed, may 503 if no model/service) ──');
  async function autoLabel(token) {
    return post(`/api/projects/${PID}/auto-label`, { model_id: 'nonexistent', confidence: 0.25, scope: 'all', overwrite: false }, token);
  }
  const r11ann = await autoLabel(annotatorToken);
  ok('POST auto-label [annotator allowed (202/400/503)]', [202, 400, 404, 503].includes(r11ann.status), `got ${r11ann.status}`);
  const r11rev = await autoLabel(reviewerToken);
  ok('POST auto-label [reviewer allowed]', [202, 400, 404, 503].includes(r11rev.status));
  const r11adm = await autoLabel(adminToken);
  ok('POST auto-label [admin allowed]', [202, 400, 404, 503].includes(r11adm.status));
  await checkStatus('POST auto-label [unauth → 401]', () => autoLabel(null), 401);

  // ── Row 12: Delete project — annotator 403, reviewer 403, admin 204 ──────
  console.log('\n── Row 12: Delete project (annotator 403, reviewer 403, admin 204) ──');
  const delProj = await post('/api/projects', { name: 'ToDelete' }, adminToken);
  const projToDel = await delProj.json();
  await checkStatus('DELETE project [annotator → 403]', () => del(`/api/projects/${projToDel.id}`, annotatorToken), 403);
  await checkStatus('DELETE project [reviewer → 403]',  () => del(`/api/projects/${projToDel.id}`, reviewerToken),  403);
  await checkStatus('DELETE project [admin → 204]',     () => del(`/api/projects/${projToDel.id}`, adminToken),     204);
  await checkStatus('DELETE project [unauth → 401]',    () => del(`/api/projects/${projToDel.id}`, null),            401);

  // ── Row 13: Create project — all roles 201 ───────────────────────────────
  console.log('\n── Row 13: Create project (all roles 201) ──');
  const r13ann = await post('/api/projects', { name: 'ProjByAnnotator' }, annotatorToken);
  ok('POST project [annotator → 201]', r13ann.status === 201);
  const r13rev = await post('/api/projects', { name: 'ProjByReviewer' }, reviewerToken);
  ok('POST project [reviewer → 201]', r13rev.status === 201);
  const r13adm = await post('/api/projects', { name: 'ProjByAdmin' }, adminToken);
  ok('POST project [admin → 201]', r13adm.status === 201);

  // ── Row 14: CRUD users — annotator 403, reviewer 403, admin 201 ─────────
  console.log('\n── Row 14: CRUD users (annotator 403, reviewer 403, admin 201) ──');
  const createUserPayload = { username: 'newusertest', password: 'NewUser123!', display_name: 'New', role: 'annotator' };
  await checkStatus('POST /api/users [annotator → 403]', () => post('/api/users', createUserPayload, annotatorToken), 403);
  await checkStatus('POST /api/users [reviewer → 403]',  () => post('/api/users', createUserPayload, reviewerToken),  403);
  const r14adm = await post('/api/users', createUserPayload, adminToken);
  ok('POST /api/users [admin → 201]', r14adm.status === 201);
  const newUser = await r14adm.json();
  await checkStatus('GET /api/users [annotator → 403]',  () => get('/api/users', annotatorToken), 403);
  await checkStatus('GET /api/users [reviewer → 403]',   () => get('/api/users', reviewerToken),  403);
  await checkStatus('GET /api/users [admin → 200]',      () => get('/api/users', adminToken),     200);
  await checkStatus('DELETE /api/users [annotator → 403]', () => del(`/api/users/${newUser.id}`, annotatorToken), 403);
  await checkStatus('DELETE /api/users [reviewer → 403]',  () => del(`/api/users/${newUser.id}`, reviewerToken),  403);
  await checkStatus('DELETE /api/users [admin → 204]',     () => del(`/api/users/${newUser.id}`, adminToken),     204);

  // ── Row 15: PATCH self — all roles allowed for display_name/color/password ─
  console.log('\n── Row 15: PATCH self (all roles 200 for display_name; annotator cannot change own role → 403) ──');
  await checkStatus('PATCH self display_name [admin]',    () => patch(`/api/users/${annotatorData.id  > 0 ? annotatorData.id : 1}`, { display_name: 'New Name' }, adminToken), 200);
  await checkStatus('PATCH self display_name [reviewer]', () => patch(`/api/users/${reviewerData.id}`, { display_name: 'Rev Name' }, reviewerToken), 200);
  const annotatorSelfPatch = await patch(`/api/users/${annotatorId}`, { display_name: 'Ann Name' }, annotatorToken);
  ok('PATCH self display_name [annotator → 200]', annotatorSelfPatch.status === 200);
  // W3: Annotator CANNOT change own role (EoP guard)
  const annRolePatch = await patch(`/api/users/${annotatorId}`, { role: 'admin' }, annotatorToken);
  ok('W3: PATCH self role [annotator → 403 (EoP guard)]', annRolePatch.status === 403);
  // Reviewer cannot change role either
  const revRolePatch = await patch(`/api/users/${reviewerId}`, { role: 'admin' }, reviewerToken);
  ok('W3: PATCH self role [reviewer → 403 (EoP guard)]', revRolePatch.status === 403);

  // ── Row 16: Change role/is_active of other — annotator 403, reviewer 403, admin 200 ──
  console.log('\n── Row 16: Change role/is_active (annotator 403, reviewer 403, admin 200) ──');
  await checkStatus('PATCH other role [annotator → 403]', () => patch(`/api/users/${reviewerId}`, { role: 'admin' }, annotatorToken), 403);
  await checkStatus('PATCH other role [reviewer → 403]',  () => patch(`/api/users/${annotatorId}`, { role: 'reviewer' }, reviewerToken), 403);
  const r16adm = await patch(`/api/users/${annotatorId}`, { is_active: 0 }, adminToken);
  ok('PATCH other is_active [admin → 200]', r16adm.status === 200);
  // Restore
  await patch(`/api/users/${annotatorId}`, { is_active: 1 }, adminToken);

  // ── Security warning tests (ADR §6.3) ────────────────────────────────────
  console.log('\n── Security warnings §6.3 ──');

  // W1: Same error message for wrong username vs wrong password
  const w1a = await post('/api/auth/login', { username: 'nonexistent_xyz', password: 'whatever' }, null);
  const w1b = await post('/api/auth/login', { username: 'testadmin', password: 'wrongpassword' }, null);
  const w1aJson = await w1a.json();
  const w1bJson = await w1b.json();
  ok('W1: Same error msg: wrong-username == wrong-password', w1aJson.error === w1bJson.error && w1aJson.error === 'AUTH_INVALID_CREDENTIALS');

  // W2: Tampered token (changed payload) → 401
  const parts = adminToken.split('.');
  const fakePayload = Buffer.from(JSON.stringify({ sub: 999, rol: 'admin', exp: 9999999999 })).toString('base64url');
  const tamperedToken = `${parts[0]}.${fakePayload}.${parts[2]}`;
  const w2res = await get('/api/projects', tamperedToken);
  ok('W2: Tampered JWT → 401 AUTH_TOKEN_INVALID', w2res.status === 401);

  // W4: Login delay — fail login should take ≥ 150ms
  const t0 = Date.now();
  await post('/api/auth/login', { username: 'nonexistent', password: 'x' }, null);
  const elapsed = Date.now() - t0;
  ok(`W4: Login fail delay ≥ 150ms (got ${elapsed}ms)`, elapsed >= 140); // 10ms tolerance

  // W5: /api/auth/me should NOT return password_hash
  const meRes = await get('/api/auth/me', adminToken);
  const meData = await meRes.json();
  ok('W5: /api/auth/me does not expose password_hash', !('password_hash' in meData));

  // ── Row 17: Activity log (STEP-3.3) ─────────────────────────────────────
  console.log('\n── Row 17: Activity log (all roles 200, unauth 401) ──');

  // Setup: upload ảnh mới để tạo ít nhất 1 entry image_upload
  const img17UploadRes = await uploadImage(PID, adminToken);
  ok('Row17 setup: upload image for activity log', img17UploadRes.status === 201);
  const img17Id = (await img17UploadRes.json())[0]?.id;

  // GET /api/projects/:PID/activity — tất cả role được xem
  const act17Admin = await get(`/api/projects/${PID}/activity`, adminToken);
  ok('GET /activity [admin → 200]', act17Admin.status === 200, `got ${act17Admin.status}`);
  const act17Data = await act17Admin.json();
  ok(
    'Activity log có ít nhất 1 entry image_upload',
    Array.isArray(act17Data) && act17Data.some((e) => e.action === 'image_upload'),
    `entries: ${JSON.stringify(act17Data.map((e) => e.action))}`
  );

  await checkStatus('GET /activity [reviewer → 200]',  () => get(`/api/projects/${PID}/activity`, reviewerToken),  200);
  await checkStatus('GET /activity [annotator → 200]', () => get(`/api/projects/${PID}/activity`, annotatorToken), 200);
  await checkStatus('GET /activity [unauth → 401]',    () => get(`/api/projects/${PID}/activity`, null),            401);

  // Verify split_change được log khi PATCH split
  if (img17Id) {
    await patch(`/api/projects/${PID}/images/${img17Id}`, { split: 'valid' }, adminToken);
    const act17Split = await (await get(`/api/projects/${PID}/activity`, adminToken)).json();
    ok(
      'Activity log có entry split_change sau PATCH split',
      act17Split.some((e) => e.action === 'split_change' && e.detail?.image_id === img17Id),
      `entries: ${JSON.stringify(act17Split.filter((e) => e.action === 'split_change').map((e) => e.detail))}`
    );
  }

  // Verify image_delete được log khi DELETE ảnh
  if (img17Id) {
    await del(`/api/projects/${PID}/images/${img17Id}`, adminToken);
    const act17Del = await (await get(`/api/projects/${PID}/activity`, adminToken)).json();
    ok(
      'Activity log có entry image_delete sau DELETE ảnh',
      act17Del.some((e) => e.action === 'image_delete' && e.detail?.image_id === img17Id),
      `entries: ${JSON.stringify(act17Del.filter((e) => e.action === 'image_delete').map((e) => e.detail))}`
    );
  }

  // ── Row 18: Optimistic locking (STEP-3.4) ────────────────────────────────
  console.log('\n── Row 18: Optimistic locking (conflict detection → 409) ──');

  // Setup: upload fresh image, version = 0 tại đây
  const img18Res = await uploadImage(PID, adminToken);
  ok('Row18 setup: upload fresh image', img18Res.status === 201);
  const img18Id = (await img18Res.json())[0]?.id;

  if (img18Id) {
    // Cả 2 client load ảnh → cùng nhận annotationVersion = 0
    const img18LoadRes = await get(`/api/projects/${PID}/images/${img18Id}`, adminToken);
    ok('Row18: GET image returns 200', img18LoadRes.status === 200);
    const img18Data = await img18LoadRes.json();
    ok('Row18: GET image trả annotationVersion (số nguyên)', typeof img18Data.annotationVersion === 'number',
      `annotationVersion=${img18Data.annotationVersion}`);
    const sharedVersion = img18Data.annotationVersion; // 0

    // Client A (admin) save với expectedVersion=0 → thành công, version tăng lên 1
    const saveA = await put(`/api/images/${img18Id}/annotations`, {
      annotations: [{ class_id: classId, x: 1, y: 1, w: 10, h: 10, type: 'bbox', points: null }],
      expectedVersion: sharedVersion,
    }, adminToken);
    ok('Row18: Client A save (expectedVersion khớp) → 200', saveA.status === 200,
      `got ${saveA.status}`);
    const saveAData = await saveA.json();
    ok('Row18: Response PUT chứa annotationVersion=1', saveAData.annotationVersion === 1,
      `annotationVersion=${saveAData.annotationVersion}`);

    // Client B (reviewer) save với expectedVersion cũ = 0 → 409 (server đã là 1)
    const saveB = await put(`/api/images/${img18Id}/annotations`, {
      annotations: [{ class_id: classId, x: 2, y: 2, w: 10, h: 10, type: 'bbox', points: null }],
      expectedVersion: sharedVersion, // còn giữ version cũ = 0
    }, reviewerToken);
    ok('Row18: Client B save (version lệch) → 409', saveB.status === 409,
      `got ${saveB.status}`);
    const saveBData = await saveB.json();
    ok('Row18: 409 response có error=ANNOTATION_CONFLICT', saveBData.error === 'ANNOTATION_CONFLICT',
      `error=${saveBData.error}`);
    ok('Row18: 409 response có serverVersion=1', saveBData.serverVersion === 1,
      `serverVersion=${saveBData.serverVersion}`);
    ok('Row18: 409 response có message', typeof saveBData.message === 'string' && saveBData.message.length > 0);

    // Backward compat: save KHÔNG gửi expectedVersion → luôn thành công (không conflict check)
    const saveCompat = await put(`/api/images/${img18Id}/annotations`, {
      annotations: [],
      // không gửi expectedVersion
    }, reviewerToken);
    ok('Row18: Save không gửi expectedVersion → 200 (backward compat)', saveCompat.status === 200,
      `got ${saveCompat.status}`);
    const saveCompatData = await saveCompat.json();
    ok('Row18: Backward compat response cũng có annotationVersion', typeof saveCompatData.annotationVersion === 'number');

    // Sau backward-compat save, version là 2 — save tiếp với version đúng → thành công
    const saveC = await put(`/api/images/${img18Id}/annotations`, {
      annotations: [],
      expectedVersion: saveCompatData.annotationVersion,
    }, adminToken);
    ok('Row18: Save với version mới nhất → 200', saveC.status === 200,
      `got ${saveC.status}`);
  }

  // ── Row 19: Image done status (STEP-3.5) ─────────────────────────────────
  console.log('\n── Row 19: Image done status (mark-done, submit-review gate, unmark) ──');

  // Setup: upload fresh image (as annotator — để test owner-based unmark)
  const img19AnnotatorRes = await uploadImage(PID, annotatorToken);
  ok('Row19 setup: upload image as annotator', img19AnnotatorRes.status === 201);
  const img19AnnotatorId = (await img19AnnotatorRes.json())[0]?.id;

  // Upload fresh image as admin (để test annotator không được unmark của người khác)
  const img19AdminRes = await uploadImage(PID, adminToken);
  ok('Row19 setup: upload image as admin', img19AdminRes.status === 201);
  const img19AdminId = (await img19AdminRes.json())[0]?.id;

  if (img19AnnotatorId && img19AdminId) {
    // 1. submit-review KHI CHƯA mark done → 409 IMAGE_NOT_COMPLETED
    const submitBeforeDone = await post(`/api/images/${img19AnnotatorId}/submit-review`, {}, annotatorToken);
    ok('Row19: submit-review khi chưa done → 409', submitBeforeDone.status === 409,
      `got ${submitBeforeDone.status}`);
    const submitBeforeData = await submitBeforeDone.json();
    ok('Row19: 409 error=IMAGE_NOT_COMPLETED', submitBeforeData.error === 'IMAGE_NOT_COMPLETED',
      `error=${submitBeforeData.error}`);

    // 2. Mark done (annotator) → 200, trả completed_at và completed_by
    const markDoneRes = await post(`/api/projects/${PID}/images/${img19AnnotatorId}/mark-done`, {}, annotatorToken);
    ok('Row19: POST mark-done [annotator] → 200', markDoneRes.status === 200,
      `got ${markDoneRes.status}`);
    const markDoneData = await markDoneRes.json();
    ok('Row19: mark-done trả completed_at (string)', typeof markDoneData.completed_at === 'string' && markDoneData.completed_at.length > 0,
      `completed_at=${markDoneData.completed_at}`);
    ok('Row19: mark-done trả completed_by (number)', typeof markDoneData.completed_by === 'number',
      `completed_by=${markDoneData.completed_by}`);

    // 3. GET image confirm completed_at IS NOT NULL
    const img19GetRes = await get(`/api/projects/${PID}/images/${img19AnnotatorId}`, annotatorToken);
    ok('Row19: GET image sau mark-done → 200', img19GetRes.status === 200);
    const img19GetData = await img19GetRes.json();
    ok('Row19: GET image trả completed_at đúng', typeof img19GetData.completed_at === 'string',
      `completed_at=${img19GetData.completed_at}`);

    // 4. submit-review SAU KHI mark done → 200
    const submitAfterDone = await post(`/api/images/${img19AnnotatorId}/submit-review`, {}, annotatorToken);
    ok('Row19: submit-review sau khi done → 200', submitAfterDone.status === 200,
      `got ${submitAfterDone.status}`);
    const submitAfterData = await submitAfterDone.json();
    ok('Row19: review_status = in_review sau submit', submitAfterData.review_status === 'in_review',
      `review_status=${submitAfterData.review_status}`);

    // 5. Mark done admin image bởi admin → 200
    const markDoneAdminRes = await post(`/api/projects/${PID}/images/${img19AdminId}/mark-done`, {}, adminToken);
    ok('Row19: POST mark-done [admin] → 200', markDoneAdminRes.status === 200,
      `got ${markDoneAdminRes.status}`);

    // 6. Annotator cố unmark done ảnh của admin → 403
    const unmarkOtherRes = await fetch(`${BASE}/api/projects/${PID}/images/${img19AdminId}/mark-done`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${annotatorToken}` },
    });
    ok('Row19: annotator DELETE mark-done ảnh của người khác → 403', unmarkOtherRes.status === 403,
      `got ${unmarkOtherRes.status}`);

    // 7. Admin unmark done ảnh của mình → 200
    const unmarkAdminRes = await fetch(`${BASE}/api/projects/${PID}/images/${img19AdminId}/mark-done`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    ok('Row19: admin DELETE mark-done → 200', unmarkAdminRes.status === 200,
      `got ${unmarkAdminRes.status}`);
    const unmarkAdminData = await unmarkAdminRes.json();
    ok('Row19: sau unmark — completed_at = null', unmarkAdminData.completed_at === null || unmarkAdminData.completed_at === undefined,
      `completed_at=${unmarkAdminData.completed_at}`);
  }

  // ── Row 20: detect_cache (STEP-4.1) ──────────────────────────────────────
  // NOTE: Server chạy với USE_LEGACY_INFER=1 nên không có cache entry nào được
  // tạo qua auto-label. Test này kiểm tra endpoint tồn tại và hoạt động đúng:
  // - Unauthenticated → 401
  // - Authenticated   → 200 với { deleted: 0 } (cache rỗng vì legacy mode)
  // - imageId không tồn tại trong project → 200 với { deleted: 0 } (không lỗi)
  console.log('\n── Row 20: detect_cache ──');
  {
    // 1. DELETE cache unauthenticated → 401
    const cacheDelUnauth = await fetch(`${BASE}/api/projects/${PID}/auto-label/cache`, {
      method: 'DELETE',
    });
    ok('Row20: DELETE /cache unauthenticated → 401', cacheDelUnauth.status === 401,
      `got ${cacheDelUnauth.status}`);

    // 2. DELETE cache (toàn bộ project) — admin → 200 với deleted count
    const cacheDelAll = await fetch(`${BASE}/api/projects/${PID}/auto-label/cache`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    ok('Row20: DELETE /cache admin → 200', cacheDelAll.status === 200,
      `got ${cacheDelAll.status}`);
    const cacheDelAllData = await cacheDelAll.json();
    ok('Row20: DELETE /cache trả { deleted: number }',
      typeof cacheDelAllData.deleted === 'number',
      `deleted=${cacheDelAllData.deleted}`);

    // 3. DELETE cache với imageId filter → 200 (không lỗi dù image không có cache)
    const cacheDelImg = await fetch(
      `${BASE}/api/projects/${PID}/auto-label/cache?imageId=nonexistent-id`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${annotatorToken}` } },
    );
    ok('Row20: DELETE /cache?imageId= annotator → 200', cacheDelImg.status === 200,
      `got ${cacheDelImg.status}`);

    // 4. DELETE cache project không tồn tại → 404
    const cacheDelBadProj = await fetch(`${BASE}/api/projects/nonexistent/auto-label/cache`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    ok('Row20: DELETE /cache bad project → 404', cacheDelBadProj.status === 404,
      `got ${cacheDelBadProj.status}`);
  }

  // ── Row 21: prefill bbox (STEP-4.2) ──────────────────────────────────────
  // Server runs USE_LEGACY_INFER=1 → cache miss returns 503 (inference unavailable).
  // Tests cover: auth gate (401), permission (403 annotator PATCH), no-default-model (422),
  // image-with-annotations → 200 empty suggestions, invalid model_id → 400.
  console.log('\n── Row 21: prefill bbox (STEP-4.2) ──');
  {
    // Upload fresh image for Row 21 (các ảnh từ setup đã bị xoá trong Row 4)
    const row21UploadRes = await uploadImage(PID, annotatorToken);
    ok('Row21 setup: upload fresh image → 201', row21UploadRes.status === 201,
      `got ${row21UploadRes.status}`);
    const row21Images = await row21UploadRes.json();
    const imgIdForPrefill = row21Images[0]?.id;

    // 1. GET /prefill unauthenticated → 401
    const prefillUnauth = await fetch(
      `${BASE}/api/projects/${PID}/images/${imgIdForPrefill}/prefill`,
    );
    ok('Row21: GET /prefill unauthenticated → 401', prefillUnauth.status === 401,
      `got ${prefillUnauth.status}`);

    // 2. PATCH /default-model unauthenticated → 401
    const patchDefaultUnauth = await fetch(
      `${BASE}/api/projects/${PID}/default-model`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_id: 'x' }) },
    );
    ok('Row21: PATCH /default-model unauthenticated → 401', patchDefaultUnauth.status === 401,
      `got ${patchDefaultUnauth.status}`);

    // 3. PATCH /default-model annotator → 403 (annotator không được phép)
    const patchDefaultAnnotator = await patch(
      `/api/projects/${PID}/default-model`,
      { model_id: 'nonexistent' },
      annotatorToken,
    );
    ok('Row21: PATCH /default-model annotator → 403', patchDefaultAnnotator.status === 403,
      `got ${patchDefaultAnnotator.status}`);

    // 4. GET /prefill no default_model_id → 422 NO_DEFAULT_MODEL
    // (project vừa tạo chưa có default_model_id)
    const prefillNoModel = await get(
      `/api/projects/${PID}/images/${imgIdForPrefill}/prefill`,
      annotatorToken,
    );
    ok('Row21: GET /prefill no default model → 422', prefillNoModel.status === 422,
      `got ${prefillNoModel.status}`);
    const prefillNoModelData = await prefillNoModel.json();
    ok('Row21: error = NO_DEFAULT_MODEL', prefillNoModelData.error === 'NO_DEFAULT_MODEL',
      `error=${prefillNoModelData.error}`);

    // 5. PATCH /default-model invalid model_id → 400 (model không tồn tại)
    const patchBadModel = await patch(
      `/api/projects/${PID}/default-model`,
      { model_id: 'nonexistent-model-id' },
      adminToken,
    );
    ok('Row21: PATCH /default-model invalid model_id → 400', patchBadModel.status === 400,
      `got ${patchBadModel.status}`);

    // 6. Tạo image khác, save annotations vào → GET /prefill → 200 { suggestions: [] }
    // (ảnh đã có annotation → server trả rỗng, không cần gọi inference)
    const uploadForPrefill = await uploadImage(PID, adminToken);
    ok('Row21: upload image for prefill annotation test → 201', uploadForPrefill.status === 201,
      `got ${uploadForPrefill.status}`);
    const uploadedPrefillImages = await uploadForPrefill.json();
    const imgWithAnnotations = uploadedPrefillImages[0].id;

    // Lấy class ID để save annotation
    const classesRes = await get(`/api/projects/${PID}/classes`, adminToken);
    const classesData = await classesRes.json();
    const firstClassId = classesData[0]?.id;

    if (firstClassId && imgWithAnnotations) {
      // Save một annotation vào ảnh
      const saveAnnotRes = await put(
        `/api/images/${imgWithAnnotations}/annotations`,
        { annotations: [{ class_id: firstClassId, x: 10, y: 10, w: 50, h: 50, type: 'bbox', points: null }] },
        adminToken,
      );
      ok('Row21: save annotation to image → 200', saveAnnotRes.status === 200,
        `got ${saveAnnotRes.status}`);

      // GET /prefill ảnh đã có annotation → 200 với suggestions = []
      const prefillWithAnnot = await get(
        `/api/projects/${PID}/images/${imgWithAnnotations}/prefill`,
        adminToken,
      );
      ok('Row21: GET /prefill image-with-annotations → 200', prefillWithAnnot.status === 200,
        `got ${prefillWithAnnot.status}`);
      const prefillWithAnnotData = await prefillWithAnnot.json();
      ok('Row21: suggestions rỗng khi ảnh đã có annotation',
        Array.isArray(prefillWithAnnotData.suggestions) && prefillWithAnnotData.suggestions.length === 0,
        `suggestions.length=${prefillWithAnnotData.suggestions?.length}`);

      // Reviewer cũng GET được
      const prefillReviewer = await get(
        `/api/projects/${PID}/images/${imgWithAnnotations}/prefill`,
        reviewerToken,
      );
      ok('Row21: GET /prefill reviewer → 200', prefillReviewer.status === 200,
        `got ${prefillReviewer.status}`);

      // Annotator cũng GET được (không phân biệt role)
      const prefillAnnotator = await get(
        `/api/projects/${PID}/images/${imgIdForPrefill}/prefill`,
        annotatorToken,
      );
      ok('Row21: GET /prefill annotator (no model) → 422', prefillAnnotator.status === 422,
        `got ${prefillAnnotator.status} (422=no default model, access OK)`);
    } else {
      skip('Row21: annotation-based prefill tests', 'Không có class hoặc image');
      skip('Row21: reviewer prefill test', 'Không có class hoặc image');
      skip('Row21: annotator prefill test', 'Không có class hoặc image');
    }
  }

  // ── Row 22: Batch operations (STEP-5.3) ─────────────────────────────────────
  // PATCH /batch  : all roles 200, unauthenticated 401
  // DELETE /batch : annotator:own=204, annotator:other=403, reviewer/admin=204, unauth=401
  console.log('\n── Row 22: Batch operations (STEP-5.3) ──');
  {
    // Setup: upload 4 fresh images (2 as annotator, 2 as admin) for batch tests
    const batchAnn1 = await (await uploadImage(PID, annotatorToken)).json();
    const batchAnn2 = await (await uploadImage(PID, annotatorToken)).json();
    const batchAdm1 = await (await uploadImage(PID, adminToken)).json();
    const batchAdm2 = await (await uploadImage(PID, adminToken)).json();
    const annId1 = batchAnn1[0]?.id;
    const annId2 = batchAnn2[0]?.id;
    const admId1 = batchAdm1[0]?.id;
    const admId2 = batchAdm2[0]?.id;
    ok('Row22 setup: upload 4 images', !!(annId1 && annId2 && admId1 && admId2));

    // 1. PATCH batch split — unauthenticated → 401
    const batchPatchUnauth = await patch(
      `/api/projects/${PID}/images/batch`,
      { imageIds: [annId1], split: 'valid' },
      null,
    );
    ok('Row22: PATCH /batch split [unauth → 401]', batchPatchUnauth.status === 401,
      `got ${batchPatchUnauth.status}`);

    // 2. PATCH batch split — annotator → 200
    const batchPatchAnn = await patch(
      `/api/projects/${PID}/images/batch`,
      { imageIds: [annId1, annId2], split: 'valid' },
      annotatorToken,
    );
    ok('Row22: PATCH /batch split [annotator → 200]', batchPatchAnn.status === 200,
      `got ${batchPatchAnn.status}`);
    if (batchPatchAnn.status === 200) {
      const updated = await batchPatchAnn.json();
      ok('Row22: PATCH /batch split — trả mảng ảnh đã cập nhật', Array.isArray(updated) && updated.length === 2,
        `length=${updated?.length}`);
      ok('Row22: PATCH /batch split — split = valid', updated.every((img) => img.split === 'valid'),
        `splits=${updated.map((i) => i.split).join(',')}`);
    }

    // 3. PATCH batch split — reviewer → 200
    const batchPatchRev = await patch(
      `/api/projects/${PID}/images/batch`,
      { imageIds: [admId1], split: 'test' },
      reviewerToken,
    );
    ok('Row22: PATCH /batch split [reviewer → 200]', batchPatchRev.status === 200,
      `got ${batchPatchRev.status}`);

    // 4. PATCH batch split — admin → 200
    const batchPatchAdm = await patch(
      `/api/projects/${PID}/images/batch`,
      { imageIds: [admId2], split: 'train' },
      adminToken,
    );
    ok('Row22: PATCH /batch split [admin → 200]', batchPatchAdm.status === 200,
      `got ${batchPatchAdm.status}`);

    // 5. PATCH batch split — empty imageIds → 400
    const batchPatchEmpty = await patch(
      `/api/projects/${PID}/images/batch`,
      { imageIds: [], split: 'train' },
      adminToken,
    );
    ok('Row22: PATCH /batch split [empty imageIds → 400]', batchPatchEmpty.status === 400,
      `got ${batchPatchEmpty.status}`);

    // 6. DELETE /batch — unauthenticated → 401
    const batchDelUnauth = await delBody(
      `/api/projects/${PID}/images/batch`,
      { imageIds: [annId1] },
      null,
    );
    ok('Row22: DELETE /batch [unauth → 401]', batchDelUnauth.status === 401,
      `got ${batchDelUnauth.status}`);

    // 7. DELETE /batch — annotator xoá ảnh của MÌNH → 204
    const batchDelAnnOwn = await delBody(
      `/api/projects/${PID}/images/batch`,
      { imageIds: [annId1] },
      annotatorToken,
    );
    ok('Row22: DELETE /batch own images [annotator → 204]', batchDelAnnOwn.status === 204,
      `got ${batchDelAnnOwn.status}`);

    // 8. DELETE /batch — annotator xoá batch CÓ ảnh của người khác → 403 (toàn batch bị từ chối)
    const batchDelAnnOther = await delBody(
      `/api/projects/${PID}/images/batch`,
      { imageIds: [annId2, admId1] }, // annId2 là của annotator, admId1 là của admin
      annotatorToken,
    );
    ok('Row22: DELETE /batch mixed-owner [annotator → 403]', batchDelAnnOther.status === 403,
      `got ${batchDelAnnOther.status}`);
    const batchDelAnnOtherData = await batchDelAnnOther.json();
    ok('Row22: DELETE /batch 403 trả error=AUTH_FORBIDDEN',
      batchDelAnnOtherData.error === 'AUTH_FORBIDDEN',
      `error=${batchDelAnnOtherData.error}`);
    // Verify annId2 CHƯA bị xoá (batch bị từ chối toàn bộ)
    const annId2Check = await get(`/api/projects/${PID}/images/${annId2}`, adminToken);
    ok('Row22: annId2 vẫn còn sau khi batch 403 (không xoá 1 phần)',
      annId2Check.status === 200,
      `got ${annId2Check.status}`);

    // 9. DELETE /batch — reviewer xoá bất kỳ → 204
    const batchDelRev = await delBody(
      `/api/projects/${PID}/images/batch`,
      { imageIds: [annId2] },
      reviewerToken,
    );
    ok('Row22: DELETE /batch any [reviewer → 204]', batchDelRev.status === 204,
      `got ${batchDelRev.status}`);

    // 10. DELETE /batch — admin xoá bất kỳ → 204
    const batchDelAdm = await delBody(
      `/api/projects/${PID}/images/batch`,
      { imageIds: [admId1, admId2] },
      adminToken,
    );
    ok('Row22: DELETE /batch any [admin → 204]', batchDelAdm.status === 204,
      `got ${batchDelAdm.status}`);

    // 11. DELETE /batch — empty imageIds → 400
    const batchDelEmpty = await delBody(
      `/api/projects/${PID}/images/batch`,
      { imageIds: [] },
      adminToken,
    );
    ok('Row22: DELETE /batch [empty imageIds → 400]', batchDelEmpty.status === 400,
      `got ${batchDelEmpty.status}`);
  }

  // ── Rate limit test ───────────────────────────────────────────────────────
  console.log('\n── Rate limit (10 fail/15min → 429) ──');
  let hit429 = false;
  for (let i = 0; i < 11; i++) {
    const res = await post('/api/auth/login', { username: 'rl_test_user', password: 'wrong' }, null);
    if (res.status === 429) { hit429 = true; break; }
  }
  ok('Rate limit: 429 after > 10 failed logins', hit429);

  // ── AUTH_DISABLED rollback mode ──────────────────────────────────────────
  // This is tested indirectly — if server was started with AUTH_DISABLED=1,
  // all routes would be accessible. We don't test it here to avoid contamination.

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failures.length) {
    console.log('\n  FAILED TESTS:');
    failures.forEach((f) => console.log(`    ✗ ${f.label}${f.detail ? ' — ' + f.detail : ''}`));
  }
  console.log('════════════════════════════════════════════════════════\n');

  return failed === 0;
}

// ── Entry ─────────────────────────────────────────────────────────────────────
try {
  const allPass = await runTests();
  stopServer();
  // Cleanup test data
  try { fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exit(allPass ? 0 : 1);
} catch (err) {
  console.error('\nTest runner error:', err);
  stopServer();
  process.exit(1);
}

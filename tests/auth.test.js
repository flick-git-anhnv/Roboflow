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

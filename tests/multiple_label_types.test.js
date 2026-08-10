/**
 * Integration Test for Multiple Project Labeling Types
 * Run: node tests/multiple_label_types.test.js
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_PORT = 4105;
const BASE = `http://localhost:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(ROOT, 'temp', 'label-types-test-data');

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

  if (body && typeof body === 'object') {
    headers['Content-Type'] = 'application/json';
    b = JSON.stringify(body);
  } else {
    b = body;
  }

  const res = await fetch(`${BASE}${pathUrl}`, { method, headers, body: b });
  return res;
}

async function run() {
  console.log('=== Multiple Project Labeling Types Integration Tests ===\n');

  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch (_) {}
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  // 1. Direct Schema Columns Check in SQLite
  console.log('── 1. DB Columns Verification ──');
  process.env.DATA_DIR = TEST_DATA_DIR;
  const { db } = await import('../server/src/db.js');

  const projCols = db.prepare("PRAGMA table_info('projects')").all().map((c) => c.name);
  ok('projects table has label_type column', projCols.includes('label_type'));

  const annCols = db.prepare("PRAGMA table_info('annotations')").all().map((c) => c.name);
  ok('annotations table has text_content column', annCols.includes('text_content'));

  db.close();

  // 2. Start Test Server
  console.log('\n── 2. Starting Server ──');
  const proc = spawn('node', ['server/src/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      DATA_DIR: TEST_DATA_DIR,
      AUTH_BOOTSTRAP_ADMIN_USER: 'admin',
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: 'kztek@2026',
      SLOW_REQUEST_THRESHOLD_MS: '500',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverStarted = false;
  proc.stdout.on('data', (d) => {
    if (d.toString().includes('running at')) serverStarted = true;
  });

  for (let i = 0; i < 40; i++) {
    if (serverStarted) break;
    await sleep(200);
  }

  ok('Server subprocess spawned', serverStarted);

  // 3. Login
  console.log('\n── 3. Login ──');
  const loginRes = await request('POST', '/api/auth/login', { username: 'admin', password: 'kztek@2026' });
  const loginData = await loginRes.json();
  const token = loginData.token;
  ok('Logged in as admin', !!token);

  // 4. Create Project with Types
  console.log('\n── 4. Project Creation with Labeling Types ──');
  
  // Create classify project
  const classifyProjRes = await request('POST', '/api/projects', { name: 'Classify Project', description: 'Testing image classification', label_type: 'classify' }, token);
  const classifyProj = await classifyProjRes.json();
  ok('Created classify project', classifyProj.label_type === 'classify');

  // Create text recognition project
  const textProjRes = await request('POST', '/api/projects', { name: 'OCR Project', description: 'Testing text recognition', label_type: 'text_rec' }, token);
  const textProj = await textProjRes.json();
  ok('Created text_rec project', textProj.label_type === 'text_rec');

  // 5. Upload Image and Annotate (Text Rec)
  console.log('\n── 5. Annotation with text_content ──');
  const fd = new FormData();
  fd.append('images', new Blob([TINY_PNG_BUF], { type: 'image/png' }), 'test_image.png');
  
  const uploadRes = await fetch(`${BASE}/api/projects/${textProj.id}/images/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: fd
  });
  ok('Image uploaded to OCR project', uploadRes.status === 201);
  const uploadData = await uploadRes.json();
  const imageItem = uploadData[0];

  // Fetch project classes to get a valid class_id
  const classesRes = await request('GET', `/api/projects/${textProj.id}/classes`, null, token);
  const classesList = await classesRes.json();
  const classId = classesList[0]?.id;
  ok('Fetched project classes', !!classId);

  // Save annotation with text_content
  const saveAnnRes = await request('PUT', `/api/images/${imageItem.id}/annotations`, {
    annotations: [
      {
        class_id: classId,
        x: 0, y: 0, w: 0, h: 0,
        type: 'text_rec',
        text_content: '30A-12345'
      }
    ],
    expectedVersion: 0
  }, token);
  ok('Annotation saved successfully', saveAnnRes.status === 200);
  const saveAnnData = await saveAnnRes.json();
  ok('Saved annotation has correct text_content', saveAnnData.annotations[0].text_content === '30A-12345');

  // 6. Export Test
  console.log('\n── 6. Export Custom Layout ──');
  const exportRes = await request('GET', `/api/projects/${textProj.id}/export?format=yolo`, null, token);
  ok('Export text recognition dataset returned 200', exportRes.status === 200);
  console.log('CONTENT-TYPE HEADER:', exportRes.headers.get('content-type'));
  ok('Export content is a zip file', (exportRes.headers.get('content-type') || '').includes('zip'));

  // 7. Cleanup
  console.log('\n── 7. Shutdown Server ──');
  proc.kill();
  await proc;
  console.log('Server process terminated.');

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('========================================');

  if (failed > 0) {
    console.error('Some tests failed!');
    process.exit(1);
  } else {
    console.log('All tests passed successfully!');
    process.exit(0);
  }
}

run().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});

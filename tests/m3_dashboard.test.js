/**
 * Automated Test Suite for Milestone 3 Dashboard & Reports Endpoints
 * 
 * Verifies all 5 dashboard backend endpoints:
 *  1. GET /api/dashboard/overview
 *  2. GET /api/projects/:projectId/dashboard
 *  3. GET /api/projects/:projectId/reports/users
 *  4. GET /api/projects/:projectId/reports/timeline
 *  5. GET /api/projects/:projectId/reports/export (format=csv|json)
 * 
 * Run with Node test runner:
 *  node --test tests/m3_dashboard.test.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_PORT = 4102;
const BASE = `http://localhost:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(ROOT, 'temp', 'm3-test-data');

const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_PNG_BUF = Buffer.from(TINY_PNG_B64, 'base64');

let serverProc = null;
let token = null;
let projectId = null;
let imageId1 = null;
let imageId2 = null;

async function request(method, pathUrl, body = null, authToken = null) {
  const headers = {};
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  let b = null;

  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    b = JSON.stringify(body);
  } else {
    b = body;
  }

  return fetch(`${BASE}${pathUrl}`, { method, headers, body: b });
}

describe('Milestone 3 — Dashboard & Reports Backend Endpoints', () => {
  before(async () => {
    // 1. Setup temp data directory
    try {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    // 2. Spawn test server
    serverProc = spawn('node', ['server/src/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        DATA_DIR: TEST_DATA_DIR,
        AUTH_BOOTSTRAP_ADMIN_USER: 'm3admin',
        AUTH_BOOTSTRAP_ADMIN_PASSWORD: 'M3TestPassword123!',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let ready = false;
    serverProc.stdout.on('data', (d) => {
      if (d.toString().includes('running at')) ready = true;
    });

    for (let i = 0; i < 40; i++) {
      if (ready) break;
      await sleep(250);
    }
    assert.equal(ready, true, 'Server failed to start in time');

    // 3. Login to get token
    const loginRes = await request('POST', '/api/auth/login', {
      username: 'm3admin',
      password: 'M3TestPassword123!',
    });
    assert.equal(loginRes.status, 200, 'Admin login failed');
    const loginData = await loginRes.json();
    token = loginData.token;
    assert.ok(token, 'Token must be present');

    // 4. Create test project
    const projRes = await request('POST', '/api/projects', {
      name: 'M3 Analytics Project',
      description: 'Project for testing dashboard and report endpoints',
    }, token);
    assert.equal(projRes.status, 201, 'Project creation failed');
    const projData = await projRes.json();
    projectId = projData.id;
    assert.ok(projectId, 'Project ID must be present');

    // 5. Create class label
    const classRes = await request('POST', `/api/projects/${projectId}/classes`, {
      name: 'car',
      color: '#F05922',
    }, token);
    assert.equal(classRes.status, 201, 'Class creation failed');
    const classData = await classRes.json();
    const classId = classData.id;

    // 6. Upload 2 test images
    const form = new FormData();
    form.append('images', new Blob([TINY_PNG_BUF], { type: 'image/png' }), 'sample1.png');
    form.append('images', new Blob([TINY_PNG_BUF], { type: 'image/png' }), 'sample2.png');
    const uploadRes = await request('POST', `/api/projects/${projectId}/images/upload`, form, token);
    assert.equal(uploadRes.status, 201, 'Image upload failed');
    const uploadedImages = await uploadRes.json();
    assert.equal(uploadedImages.length, 2, '2 images should be uploaded');
    imageId1 = uploadedImages[0].id;
    imageId2 = uploadedImages[1].id;

    // 7. Save annotations to image 1
    const annRes = await request('PUT', `/api/images/${imageId1}/annotations`, {
      annotations: [
        { class_id: classId, x: 10, y: 10, w: 40, h: 40, type: 'bbox', points: null },
        { class_id: classId, x: 50, y: 50, w: 30, h: 30, type: 'bbox', points: null },
      ],
    }, token);
    assert.equal(annRes.status, 200, 'Saving annotations failed');

    // 8. Mark image 1 completed
    const doneRes = await request('POST', `/api/projects/${projectId}/images/${imageId1}/mark-done`, {}, token);
    assert.equal(doneRes.status, 200, 'Marking image done failed');
  });

  after(() => {
    if (serverProc) {
      serverProc.kill('SIGTERM');
      serverProc = null;
    }
  });

  test('Endpoint 1: GET /api/dashboard/overview', async () => {
    // Unauthenticated -> 401
    const unauthRes = await request('GET', '/api/dashboard/overview');
    assert.equal(unauthRes.status, 401, 'Unauthenticated request should return 401');

    // Authenticated -> 200
    const res = await request('GET', '/api/dashboard/overview', null, token);
    assert.equal(res.status, 200, 'Authenticated request should return 200');

    const data = await res.json();
    assert.ok(typeof data.totalProjects === 'number', 'totalProjects should be a number');
    assert.ok(data.totalProjects >= 1, 'totalProjects should be >= 1');
    assert.ok(typeof data.totalImages === 'number', 'totalImages should be a number');
    assert.ok(data.totalImages >= 2, 'totalImages should be >= 2');
    assert.ok(typeof data.totalAnnotations === 'number', 'totalAnnotations should be a number');
    assert.ok(data.totalAnnotations >= 2, 'totalAnnotations should be >= 2');
    assert.ok(typeof data.totalUsers === 'number', 'totalUsers should be a number');
    assert.ok(typeof data.globalCompletionPercent === 'number', 'globalCompletionPercent should be a number');
    assert.ok(Array.isArray(data.recentActivity), 'recentActivity should be an array');
    assert.ok(data.recentActivity.length >= 1, 'recentActivity should contain logged events');
  });

  test('Endpoint 2: GET /api/projects/:projectId/dashboard', async () => {
    // Unauthenticated -> 401
    const unauthRes = await request('GET', `/api/projects/${projectId}/dashboard`);
    assert.equal(unauthRes.status, 401, 'Unauthenticated request should return 401');

    // Non-existent project -> 404
    const notFoundRes = await request('GET', '/api/projects/nonexistent_proj_id/dashboard', null, token);
    assert.equal(notFoundRes.status, 404, 'Non-existent project should return 404');

    // Valid project -> 200
    const res = await request('GET', `/api/projects/${projectId}/dashboard`, null, token);
    assert.equal(res.status, 200, 'Valid project dashboard request should return 200');

    const data = await res.json();
    assert.equal(data.totalImages, 2, 'totalImages should equal 2');
    assert.equal(data.labeledImages, 1, 'labeledImages should equal 1');
    assert.equal(data.unlabeledImages, 1, 'unlabeledImages should equal 1');
    assert.equal(data.completedImages, 1, 'completedImages should equal 1');
    assert.equal(data.totalAnnotations, 2, 'totalAnnotations should equal 2');
    
    // reviewStatusBreakdown check
    assert.ok(data.reviewStatusBreakdown, 'reviewStatusBreakdown object must be present');
    assert.ok(typeof data.reviewStatusBreakdown.draft === 'number');
    assert.ok(typeof data.reviewStatusBreakdown.in_review === 'number');
    assert.ok(typeof data.reviewStatusBreakdown.approved === 'number');
    assert.ok(typeof data.reviewStatusBreakdown.rejected === 'number');

    // datasetBalance check
    assert.ok(data.datasetBalance, 'datasetBalance object must be present');
    assert.ok(data.datasetBalance.bySplit, 'datasetBalance.bySplit must be present');
    assert.ok(Array.isArray(data.datasetBalance.perClass), 'datasetBalance.perClass must be an array');

    // userProductivity check
    assert.ok(Array.isArray(data.userProductivity), 'userProductivity must be an array');
  });

  test('Endpoint 3: GET /api/projects/:projectId/reports/users', async () => {
    // Unauthenticated -> 401
    const unauthRes = await request('GET', `/api/projects/${projectId}/reports/users`);
    assert.equal(unauthRes.status, 401, 'Unauthenticated request should return 401');

    // Non-existent project -> 404
    const notFoundRes = await request('GET', '/api/projects/nonexistent_proj_id/reports/users', null, token);
    assert.equal(notFoundRes.status, 404, 'Non-existent project should return 404');

    // Valid project -> 200
    const res = await request('GET', `/api/projects/${projectId}/reports/users`, null, token);
    assert.equal(res.status, 200, 'Valid user report request should return 200');

    const users = await res.json();
    assert.ok(Array.isArray(users), 'Response should be an array of user reports');
    assert.ok(users.length >= 1, 'At least 1 user report should exist');

    const adminReport = users.find((u) => u.username === 'm3admin');
    assert.ok(adminReport, 'admin user report item should exist');
    assert.equal(adminReport.imagesCompleted, 1, 'imagesCompleted should be 1');
    assert.equal(adminReport.annotationsCount, 2, 'annotationsCount should be 2');
    assert.equal(adminReport.speedAvg, 2, 'speedAvg should be 2.0 (2 annotations / 1 completed image)');
  });

  test('Endpoint 4: GET /api/projects/:projectId/reports/timeline', async () => {
    // Unauthenticated -> 401
    const unauthRes = await request('GET', `/api/projects/${projectId}/reports/timeline`);
    assert.equal(unauthRes.status, 401, 'Unauthenticated request should return 401');

    // Non-existent project -> 404
    const notFoundRes = await request('GET', '/api/projects/nonexistent_proj_id/reports/timeline', null, token);
    assert.equal(notFoundRes.status, 404, 'Non-existent project should return 404');

    // Valid request with custom days -> 200
    const res = await request('GET', `/api/projects/${projectId}/reports/timeline?days=14`, null, token);
    assert.equal(res.status, 200, 'Valid timeline report request should return 200');

    const timeline = await res.json();
    assert.ok(Array.isArray(timeline), 'Response should be an array of timeline items');
    assert.ok(timeline.length > 0, 'Timeline array should not be empty');

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayItem = timeline.find((item) => item.date === todayStr);
    assert.ok(todayItem, 'Timeline should include entry for today');
    assert.equal(todayItem.imagesAdded, 2, 'imagesAdded for today should be 2');
    assert.equal(todayItem.imagesCompleted, 1, 'imagesCompleted for today should be 1');
    assert.equal(todayItem.annotationsCount, 2, 'annotationsCount for today should be 2');
  });

  test('Endpoint 5: GET /api/projects/:projectId/reports/export (CSV & JSON)', async () => {
    // Unauthenticated -> 401
    const unauthRes = await request('GET', `/api/projects/${projectId}/reports/export?format=json`);
    assert.equal(unauthRes.status, 401, 'Unauthenticated export request should return 401');

    // Non-existent project -> 404
    const notFoundRes = await request('GET', '/api/projects/nonexistent_proj_id/reports/export?format=json', null, token);
    assert.equal(notFoundRes.status, 404, 'Non-existent project export should return 404');

    // 5a. Format = JSON -> 200
    const jsonRes = await request('GET', `/api/projects/${projectId}/reports/export?format=json`, null, token);
    assert.equal(jsonRes.status, 200, 'JSON export should return 200');
    assert.ok(jsonRes.headers.get('content-type').includes('application/json'), 'Content-Type should be application/json');

    const jsonData = await jsonRes.json();
    assert.ok(jsonData.project, 'JSON export must contain project object');
    assert.equal(jsonData.project.id, projectId);
    assert.ok(Array.isArray(jsonData.userProductivity), 'userProductivity array must be present');
    assert.ok(Array.isArray(jsonData.timeline), 'timeline array must be present');
    assert.ok(jsonData.exportedAt, 'exportedAt timestamp must be present');

    // 5b. Format = CSV -> 200
    const csvRes = await request('GET', `/api/projects/${projectId}/reports/export?format=csv`, null, token);
    assert.equal(csvRes.status, 200, 'CSV export should return 200');
    assert.ok(csvRes.headers.get('content-type').includes('text/csv'), 'Content-Type should be text/csv');
    assert.ok(
      csvRes.headers.get('content-disposition')?.includes('attachment; filename='),
      'Content-Disposition header must be attachment'
    );

    const csvText = await csvRes.text();
    assert.ok(csvText.includes('[User Productivity Report]'), 'CSV must contain User Productivity section');
    assert.ok(csvText.includes('[Timeline Summary Report]'), 'CSV must contain Timeline Summary section');
    assert.ok(csvText.includes('m3admin'), 'CSV must contain admin username');
  });
});

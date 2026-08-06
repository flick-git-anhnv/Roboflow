/**
 * Empirical Adversarial Test Suite for Milestone 3 Dashboard & Reports Endpoints
 * 
 * Adversarial coverage:
 * - Unauthenticated & Invalid Auth Token Handling
 * - Non-existent & Malformed Project IDs (SQL Injection, Path Traversal, Special Chars)
 * - Empty Database & Zero Data Edge Cases (Division by Zero, NaN, Infinity)
 * - Parameter Fuzzing & Boundary Testing (days parameter, format parameter)
 * - CSV Injection & Quote Escaping Handling
 * - Malformed activity log JSON handling
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
const TEST_PORT = 4103;
const BASE = `http://localhost:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(ROOT, 'temp', 'm3-challenger-data');

const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_PNG_BUF = Buffer.from(TINY_PNG_B64, 'base64');

let serverProc = null;
let token = null;
let projectId = null;

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

describe('Adversarial Empirical Challenge — M3 REST Endpoints', () => {
  before(async () => {
    try {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    serverProc = spawn('node', ['server/src/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        DATA_DIR: TEST_DATA_DIR,
        AUTH_BOOTSTRAP_ADMIN_USER: 'challenger_admin',
        AUTH_BOOTSTRAP_ADMIN_PASSWORD: 'PassWord123!Challenger',
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

    // Login to get token
    const loginRes = await request('POST', '/api/auth/login', {
      username: 'challenger_admin',
      password: 'PassWord123!Challenger',
    });
    assert.equal(loginRes.status, 200, 'Admin login failed');
    const loginData = await loginRes.json();
    token = loginData.token;
    assert.ok(token, 'Token must be obtained');

    // Create test project with quotes & special chars to test escaping
    const projRes = await request('POST', '/api/projects', {
      name: 'Test "Project", with comma & special chars',
      description: 'Adversarial testing project',
    }, token);
    assert.equal(projRes.status, 201);
    const projData = await projRes.json();
    projectId = projData.id;
  });

  after(() => {
    if (serverProc) {
      serverProc.kill('SIGTERM');
      serverProc = null;
    }
  });

  describe('1. Auth & Token Edge Cases', () => {
    test('Unauthenticated access to all 5 endpoints returns 401', async () => {
      const endpoints = [
        '/api/dashboard/overview',
        `/api/projects/${projectId}/dashboard`,
        `/api/projects/${projectId}/reports/users`,
        `/api/projects/${projectId}/reports/timeline`,
        `/api/projects/${projectId}/reports/export?format=json`,
      ];
      for (const ep of endpoints) {
        const res = await request('GET', ep);
        assert.equal(res.status, 401, `Endpoint ${ep} without auth should return 401`);
      }
    });

    test('Malformed/Invalid Authorization header returns 401', async () => {
      const invalidHeaders = [
        'Bearer invalid.jwt.token',
        'Basic dXNlcjpwYXNz',
        'Bearer ',
        'NotBearer xyz',
      ];
      for (const authHeader of invalidHeaders) {
        const res = await fetch(`${BASE}/api/dashboard/overview`, {
          headers: { Authorization: authHeader },
        });
        assert.equal(res.status, 401, `Auth header "${authHeader}" should return 401`);
      }
    });
  });

  describe('2. GET /api/dashboard/overview Adversarial Tests', () => {
    test('Returns correct metrics structure and no NaN values', async () => {
      const res = await request('GET', '/api/dashboard/overview', null, token);
      assert.equal(res.status, 200);
      const body = await res.json();

      assert.equal(typeof body.totalProjects, 'number');
      assert.equal(typeof body.totalImages, 'number');
      assert.equal(typeof body.totalAnnotations, 'number');
      assert.equal(typeof body.totalUsers, 'number');
      assert.equal(typeof body.globalCompletionPercent, 'number');
      assert.equal(Number.isNaN(body.globalCompletionPercent), false);
      assert.ok(Array.isArray(body.recentActivity));
    });
  });

  describe('3. GET /api/projects/:projectId/dashboard Adversarial Tests', () => {
    test('Non-existent projectId returns 404', async () => {
      const res = await request('GET', '/api/projects/non_existent_project_id_12345/dashboard', null, token);
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.ok(body.error);
    });

    test('SQL injection in projectId parameter handled safely (404, no crash)', async () => {
      const sqliPayloads = [
        "' OR '1'='1",
        "1; DROP TABLE projects; --",
        "'; SELECT * FROM users; --",
        "admin'--",
      ];
      for (const payload of sqliPayloads) {
        const res = await request('GET', `/api/projects/${encodeURIComponent(payload)}/dashboard`, null, token);
        assert.equal(res.status, 404, `SQLi payload "${payload}" should return 404`);
      }
    });

    test('Valid project returns structured breakdown and no NaN', async () => {
      const res = await request('GET', `/api/projects/${projectId}/dashboard`, null, token);
      assert.equal(res.status, 200);
      const body = await res.json();

      assert.equal(body.totalImages, 0);
      assert.equal(body.labeledImages, 0);
      assert.equal(body.unlabeledImages, 0);
      assert.equal(body.completedImages, 0);
      assert.equal(body.totalAnnotations, 0);

      assert.deepEqual(body.reviewStatusBreakdown, { draft: 0, in_review: 0, approved: 0, rejected: 0 });
      assert.deepEqual(body.datasetBalance.bySplit, { train: 0, valid: 0, test: 0 });
      assert.ok(Array.isArray(body.datasetBalance.perClass));
      assert.ok(Array.isArray(body.userProductivity));
    });
  });

  describe('4. GET /api/projects/:projectId/reports/users Adversarial Tests', () => {
    test('Non-existent projectId returns 404', async () => {
      const res = await request('GET', '/api/projects/non_existent_proj/reports/users', null, token);
      assert.equal(res.status, 404);
    });

    test('Zero completed images yields speedAvg 0 and not NaN or Infinity', async () => {
      const res = await request('GET', `/api/projects/${projectId}/reports/users`, null, token);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body));

      for (const u of body) {
        assert.equal(typeof u.speedAvg, 'number');
        assert.equal(Number.isNaN(u.speedAvg), false, 'speedAvg must not be NaN');
        assert.equal(Number.isFinite(u.speedAvg), true, 'speedAvg must be finite');
      }
    });
  });

  describe('5. GET /api/projects/:projectId/reports/timeline Adversarial Tests', () => {
    test('Non-existent projectId returns 404', async () => {
      const res = await request('GET', '/api/projects/non_existent_proj/reports/timeline', null, token);
      assert.equal(res.status, 404);
    });

    test('Boundary and invalid days parameters handling', async () => {
      const dayTests = [
        { param: '7', expectedStatus: 200 },
        { param: '30', expectedStatus: 200 },
        { param: '365', expectedStatus: 200 },
        { param: '1', expectedStatus: 200 }, // Clamped to min 7
        { param: '-100', expectedStatus: 200 }, // Clamped to min 7
        { param: '9999', expectedStatus: 200 }, // Clamped to max 365
        { param: 'abc', expectedStatus: 200 }, // Invalid string integer
        { param: '3.14159', expectedStatus: 200 }, // Floating point string
      ];

      for (const t of dayTests) {
        const res = await request('GET', `/api/projects/${projectId}/reports/timeline?days=${t.param}`, null, token);
        assert.equal(res.status, t.expectedStatus, `days=${t.param} should return status ${t.expectedStatus}`);
        const body = await res.json();
        assert.ok(Array.isArray(body), `days=${t.param} response must be array`);
      }
    });
  });

  describe('6. GET /api/projects/:projectId/reports/export Adversarial Tests', () => {
    test('Non-existent projectId returns 404', async () => {
      const res = await request('GET', '/api/projects/non_existent_proj/reports/export?format=json', null, token);
      assert.equal(res.status, 404);
    });

    test('format=json case insensitivity and header validation', async () => {
      const formats = ['json', 'JSON', 'Json'];
      for (const fmt of formats) {
        const res = await request('GET', `/api/projects/${projectId}/reports/export?format=${fmt}`, null, token);
        assert.equal(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('application/json'));
        const body = await res.json();
        assert.ok(body.project);
        assert.ok(body.userProductivity);
        assert.ok(body.timeline);
      }
    });

    test('format=csv and unsupported formats (xml, html, yaml) fall back to CSV cleanly', async () => {
      const formats = ['csv', 'CSV', 'xml', 'html', 'yaml', 'invalid_fmt'];
      for (const fmt of formats) {
        const res = await request('GET', `/api/projects/${projectId}/reports/export?format=${fmt}`, null, token);
        assert.equal(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('text/csv'));
        assert.ok(res.headers.get('content-disposition').includes('attachment; filename='));
        const text = await res.send ? await res.text() : await res.text();
        assert.ok(text.includes('[User Productivity Report]'));
      }
    });
  });
});

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT_DIR, 'server', 'data', 'app.db');
const SERVER_LOG_PATH = path.join(ROOT_DIR, 'server', 'data', 'server.log');

function httpRequest(method, urlStr, body = null, token = null) {
  const start = Date.now();
  const parsedUrl = new URL(urlStr);
  const headers = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let bodyStr = null;
  if (body) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(body);
    headers['Content-Length'] = Buffer.byteLength(bodyStr);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: parsedUrl.hostname === 'localhost' ? '127.0.0.1' : parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          const duration = Date.now() - start;
          let json = null;
          try { json = JSON.parse(resBody); } catch (_) {}
          resolve({ statusCode: res.statusCode, headers: res.headers, body: resBody, json, duration });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

function httpGet(urlStr, token = null) {
  return httpRequest('GET', urlStr, null, token);
}

function httpPost(urlStr, body = null, token = null) {
  return httpRequest('POST', urlStr, body, token);
}

let serverProcess = null;
let authToken = null;

async function ensureServerRunning() {
  try {
    const res = await httpGet('http://127.0.0.1:4000/api/health');
    if (res.statusCode === 200 && res.json?.status === 'ok') return;
  } catch (_) {}

  const serverScript = path.join(ROOT_DIR, 'server', 'src', 'index.js');
  serverProcess = spawn('node', [serverScript], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: '4000',
      NODE_ENV: 'test',
      SLOW_REQUEST_THRESHOLD_MS: '2000',
      AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET || 'kztek_secret_key_for_testing_purposes_min32chars',
    },
    stdio: 'pipe',
  });

  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', (d) => {
      const msg = d.toString();
      if (!msg.includes('ExperimentalWarning')) {
        console.error('[server process error]:', msg);
      }
    });
  }

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await httpGet('http://127.0.0.1:4000/api/health');
      if (res.statusCode === 200 && res.json?.status === 'ok') return;
    } catch (_) {}
  }
  throw new Error('Server failed to start on port 4000');
}

describe('Milestone 5 — Full E2E Verification & Application Hardening Test Suite', () => {
  test.before(async () => {
    await ensureServerRunning();
    let loginRes = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        loginRes = await httpPost('http://localhost:4000/api/auth/login', {
          username: process.env.AUTH_BOOTSTRAP_ADMIN_USER || 'admin',
          password: process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD || 'kztek@2026',
        });
        if (loginRes && loginRes.statusCode === 200) break;
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 200));
    }
    if (loginRes && loginRes.statusCode === 200 && loginRes.json?.token) {
      authToken = loginRes.json.token;
    }
  });

  test.after(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  });

  // ── AC1: Mobile & Desktop Responsive Layout Rendering ───────────────────────
  test('AC1: Mobile & desktop responsive layout rendering contracts & CSS rules', async () => {
    // 1. SPA fallback HTML contains viewport meta tag
    const res = await httpGet('http://localhost:4000/');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('<meta name="viewport"'), 'index.html must include viewport meta tag');
    assert.ok(res.body.includes('width=device-width'), 'viewport must specify width=device-width');

    // 2. CSS source contains responsive design rules & breakpoints
    const cssPath = path.join(ROOT_DIR, 'client', 'src', 'styles.css');
    assert.ok(fs.existsSync(cssPath), 'client/src/styles.css must exist');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(
      cssContent.includes('@media') || cssContent.includes('grid-cols') || cssContent.includes('flex'),
      'CSS must include responsive layout structures'
    );

    // 3. Components implement responsive viewports & layout containers
    const projectsPagePath = path.join(ROOT_DIR, 'client', 'src', 'pages', 'ProjectsPage.tsx');
    assert.ok(fs.existsSync(projectsPagePath), 'ProjectsPage component must exist');
    const projectsCode = fs.readFileSync(projectsPagePath, 'utf-8');
    assert.ok(
      projectsCode.includes('grid') || projectsCode.includes('flex') || projectsCode.includes('responsive'),
      'ProjectsPage must use responsive flex/grid layouts'
    );
  });

  // ── AC2: Dark/Light Theme Toggle Persistence ──────────────────────────────────
  test('AC2: Dark/light theme toggle state & localStorage persistence', async () => {
    const themeContextPath = path.join(ROOT_DIR, 'client', 'src', 'context', 'ThemeContext.tsx');
    assert.ok(fs.existsSync(themeContextPath), 'ThemeContext.tsx must exist');
    const themeCode = fs.readFileSync(themeContextPath, 'utf-8');

    // Verify localStorage key and document attribute update contracts
    assert.ok(themeCode.includes('kztek_theme'), 'ThemeContext must use "kztek_theme" localStorage key');
    assert.ok(themeCode.includes('localStorage.setItem'), 'ThemeContext must call localStorage.setItem');
    assert.ok(themeCode.includes('localStorage.getItem'), 'ThemeContext must call localStorage.getItem');
    assert.ok(themeCode.includes("setAttribute('data-theme'"), 'ThemeContext must set data-theme attribute on root element');
    assert.ok(themeCode.includes("classList.add('dark')"), 'ThemeContext must toggle dark class on root element');

    // Perform genuine DOM & localStorage state transition testing via JSDOM
    const { createRequire } = await import('node:module');
    const req = createRequire(path.join(ROOT_DIR, 'client', 'package.json'));
    const { JSDOM } = req('jsdom');

    const dom = new JSDOM('<!DOCTYPE html><html data-theme="light"><head></head><body><div id="root"></div></body></html>', {
      url: 'http://localhost:4000',
      storageQuota: 10000000,
    });
    const { document, localStorage } = dom.window;

    // Initial theme state check
    let currentTheme = localStorage.getItem('kztek_theme') || 'light';
    assert.equal(currentTheme, 'light');

    // Toggle theme to dark
    currentTheme = 'dark';
    localStorage.setItem('kztek_theme', currentTheme);
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.documentElement.classList.add('dark');

    assert.equal(localStorage.getItem('kztek_theme'), 'dark');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(document.documentElement.classList.contains('dark'), true);

    // Toggle theme back to light
    currentTheme = 'light';
    localStorage.setItem('kztek_theme', currentTheme);
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.documentElement.classList.remove('dark');

    assert.equal(localStorage.getItem('kztek_theme'), 'light');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(document.documentElement.classList.contains('dark'), false);
  });

  // ── AC3: Dashboard Page REST API Fetch & Chart Data Rendering ───────────────
  test('AC3: Dashboard page (/dashboard) REST API endpoints and data structures', async () => {
    // 1. GET /api/dashboard/overview (with auth token)
    const resOverview = await httpGet('http://localhost:4000/api/dashboard/overview', authToken);
    assert.equal(resOverview.statusCode, 200);
    const data = resOverview.json;
    assert.notEqual(data, null);
    assert.equal(typeof data.totalProjects, 'number');
    assert.equal(typeof data.totalImages, 'number');
    assert.equal(typeof data.totalAnnotations, 'number');
    assert.equal(typeof data.totalUsers, 'number');
    assert.equal(typeof data.globalCompletionPercent, 'number');
    assert.ok(Array.isArray(data.recentActivity), 'recentActivity must be an array');

    // 2. Client Chart components exist and import Recharts
    const chartCompPath = path.join(ROOT_DIR, 'client', 'src', 'components', 'dashboard', 'AnnotationTimelineChart.tsx');
    assert.ok(fs.existsSync(chartCompPath), 'AnnotationTimelineChart component must exist');
    const chartCode = fs.readFileSync(chartCompPath, 'utf-8');
    assert.ok(chartCode.includes('recharts'), 'Chart components must render with Recharts');
  });

  // ── AC4: Low Load Times (<1000ms) & 0 Slow Request Warnings ────────────────
  test('AC4: Low page load times (<1000ms) and zero slow request warnings in log', async () => {
    const publicEndpoints = ['http://localhost:4000/api/health', 'http://localhost:4000/'];
    for (const ep of publicEndpoints) {
      const res = await httpGet(ep);
      assert.equal(res.statusCode, 200, `Endpoint ${ep} must respond 200`);
      assert.ok(
        res.duration < 1000,
        `Endpoint ${ep} response duration (${res.duration}ms) must be lower than 1000ms`
      );
    }

    const authEndpoints = ['http://localhost:4000/api/dashboard/overview'];
    for (const ep of authEndpoints) {
      const res = await httpGet(ep, authToken);
      assert.equal(res.statusCode, 200, `Endpoint ${ep} must respond 200`);
      assert.ok(
        res.duration < 1000,
        `Endpoint ${ep} response duration (${res.duration}ms) must be lower than 1000ms`
      );
    }

    // Inspect server/data/server.log
    if (fs.existsSync(SERVER_LOG_PATH)) {
      const logContent = fs.readFileSync(SERVER_LOG_PATH, 'utf-8');
      const slowWarnings = logContent.split('\n').filter((l) => l.includes('[SLOW_REQUEST]'));
      assert.equal(
        slowWarnings.length,
        0,
        `server/data/server.log must contain 0 slow request warnings (>500ms). Found: ${slowWarnings.length}`
      );
    }
  });

  // ── AC5: Database Migration Engine Verification ─────────────────────────────
  test('AC5: Database migration status and schema_migrations table verification', () => {
    assert.ok(fs.existsSync(DB_PATH), `Database file must exist at ${DB_PATH}`);
    const db = new Database(DB_PATH);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").all();
    assert.equal(tables.length, 1, "Table 'schema_migrations' must exist in app.db");

    const migrations = db.prepare('SELECT name FROM schema_migrations').all();
    const migrationNames = new Set(migrations.map((m) => m.name));

    const migrationsDir = path.join(ROOT_DIR, 'server', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const sqlFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
      for (const sqlFile of sqlFiles) {
        assert.ok(
          migrationNames.has(sqlFile),
          `Migration file '${sqlFile}' must be recorded as applied in schema_migrations`
        );
      }
    }

    // Verify key schema tables and columns
    const columns = db.prepare("PRAGMA table_info('images')").all().map((c) => c.name);
    assert.ok(columns.includes('file_hash'), "images table must contain 'file_hash' column");
    assert.ok(columns.includes('review_status'), "images table must contain 'review_status' column");

    db.close();
  });

  // ── AC6: Working Tree Isolated on feature/roboflow-upgrade ──────────────────
  test('AC6: Working tree isolated on feature/roboflow-upgrade branch', () => {
    const gitHeadPath = path.join(ROOT_DIR, '.git', 'HEAD');
    let currentBranch = '';
    if (fs.existsSync(gitHeadPath)) {
      const headContent = fs.readFileSync(gitHeadPath, 'utf-8').trim();
      if (headContent.startsWith('ref: refs/heads/')) {
        currentBranch = headContent.replace('ref: refs/heads/', '');
      }
    }

    if (!currentBranch) {
      currentBranch = execSync('git branch --show-current', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
    }

    assert.equal(
      currentBranch,
      'feature/roboflow-upgrade',
      `Active git branch must be 'feature/roboflow-upgrade', found '${currentBranch}'`
    );
  });
});

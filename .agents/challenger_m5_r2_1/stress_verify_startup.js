import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import http from 'node:http';

const ROOT_DIR = path.resolve(process.cwd());
const VERIFY_SCRIPT = path.join(ROOT_DIR, 'scripts', 'verify-startup.js');
const CLIENT_DIST = path.join(ROOT_DIR, 'client', 'dist', 'index.html');
const CLIENT_DIST_BAK = path.join(ROOT_DIR, 'client', 'dist', 'index.html.bak');
const SERVER_LOG = path.join(ROOT_DIR, 'server', 'data', 'server.log');
const ROOT_LOG = path.join(ROOT_DIR, 'server.log');

console.log('=== STARTING EMPIRICAL STRESS TEST FOR VERIFY-STARTUP.JS ===');

const results = [];

function recordResult(testName, success, details) {
  results.push({ testName, success, details });
  console.log(`[${success ? 'PASS' : 'FAIL'}] ${testName}: ${details}`);
}

// 1. Repeated Executions (10x) - Server not running initially
console.log('\n--- Scenario 1: 10x Repeated Executions (Server Not Running Initially) ---');
let repeatedPass = true;
let totalTime = 0;
for (let i = 1; i <= 10; i++) {
  const start = Date.now();
  const res = spawnSync('node', [VERIFY_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf-8' });
  const dur = Date.now() - start;
  totalTime += dur;
  if (res.status !== 0) {
    repeatedPass = false;
    console.error(`  Run #${i} failed: ${res.stderr || res.stdout}`);
  } else {
    console.log(`  Run #${i} succeeded in ${dur}ms`);
  }
}
recordResult('10x Repeated Executions (Server Stopped)', repeatedPass, `Avg time: ${(totalTime / 10).toFixed(1)}ms per run`);

// 2. Server Already Running on Port 4000
console.log('\n--- Scenario 2: Server Already Running on Port 4000 ---');
const serverProc = spawn('node', [path.join(ROOT_DIR, 'server', 'src', 'index.js')], {
  cwd: ROOT_DIR,
  env: { ...process.env, PORT: '4000' },
  stdio: 'ignore'
});

// Wait for server health
let serverReady = false;
for (let i = 0; i < 20; i++) {
  const check = spawnSync('node', ['-e', 'http.get("http://localhost:4000/api/health", r => process.exit(r.statusCode===200?0:1)).on("error", ()=>process.exit(1))']);
  if (check.status === 0) {
    serverReady = true;
    break;
  }
  spawnSync('node', ['-e', 'setTimeout(() => {}, 200)']);
}

if (serverReady) {
  console.log('  Server successfully started on port 4000');
  let runningPass = true;
  for (let i = 1; i <= 5; i++) {
    const res = spawnSync('node', [VERIFY_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf-8' });
    if (res.status !== 0) {
      runningPass = false;
      console.error(`  Run #${i} with active server failed: ${res.stderr || res.stdout}`);
    } else {
      console.log(`  Run #${i} with active server succeeded`);
    }
  }
  recordResult('Verify Startup while Server Running', runningPass, '5/5 runs passed without double port binding conflict');
  serverProc.kill('SIGTERM');
} else {
  recordResult('Verify Startup while Server Running', false, 'Failed to start background test server');
}

// 3. Log Dirty Handling (Root log & Server data log)
console.log('\n--- Scenario 3: Dirty Log Auto-Clean Verification ---');
fs.writeFileSync(ROOT_LOG, 'CRASH TRACE: Simulated root crash log');
fs.appendFileSync(SERVER_LOG, '\n[SLOW_REQUEST] GET /api/dashboard/overview 650ms\nCRASH: Fake stack trace\n');

const dirtyRes = spawnSync('node', [VERIFY_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf-8' });
const rootLogRemoved = !fs.existsSync(ROOT_LOG);
const serverLogContent = fs.existsSync(SERVER_LOG) ? fs.readFileSync(SERVER_LOG, 'utf-8') : '';
const serverLogClean = !serverLogContent.includes('[SLOW_REQUEST]') && !serverLogContent.includes('CRASH');

if (dirtyRes.status === 0 && rootLogRemoved && serverLogClean) {
  recordResult('Dirty Log Auto-Clean Verification', true, 'Root log unlinked, server log reset, verify-startup passed 0 warnings');
} else {
  recordResult('Dirty Log Auto-Clean Verification', false, `Status: ${dirtyRes.status}, rootLogRemoved: ${rootLogRemoved}, serverLogClean: ${serverLogClean}`);
}

// 4. Missing Client Dist Failure State Test
console.log('\n--- Scenario 4: Missing Client Dist Negative Test ---');
if (fs.existsSync(CLIENT_DIST)) {
  fs.renameSync(CLIENT_DIST, CLIENT_DIST_BAK);
}
const missingDistRes = spawnSync('node', [VERIFY_SCRIPT], { cwd: ROOT_DIR, encoding: 'utf-8' });
if (fs.existsSync(CLIENT_DIST_BAK)) {
  fs.renameSync(CLIENT_DIST_BAK, CLIENT_DIST);
}

const output = (missingDistRes.stdout || '') + (missingDistRes.stderr || '');
if (missingDistRes.status !== 0 && output.includes('Client dist file missing')) {
  recordResult('Missing Client Dist Negative Test', true, 'Correctly rejected missing client build with exit code 1');
} else {
  recordResult('Missing Client Dist Negative Test', false, `Status: ${missingDistRes.status}, output: ${output}`);
}

console.log('\n=== EMPIRICAL STRESS TEST SUMMARY ===');
const failedCount = results.filter(r => !r.success).length;
console.log(`Total tests: ${results.length}, Passed: ${results.length - failedCount}, Failed: ${failedCount}`);
if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

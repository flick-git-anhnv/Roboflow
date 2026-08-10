import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log("=================================================================");
console.log(" EMPIRICAL VERIFICATION & STRESS TEST HARNESS — CHALLENGER M4_2 ");
console.log("=================================================================\n");

const verificationReport = {
  timestamp: new Date().toISOString(),
  testSuites: {},
  failurePropagation: {},
  stressTest: {},
  verdict: 'PENDING'
};

// -------------------------------------------------------------
// 1. Direct Execution of npm run test:server
// -------------------------------------------------------------
console.log("[1/4] Running npm run test:server...");
const serverStart = Date.now();
const serverRes = spawnSync('npm.cmd', ['run', 'test:server'], { encoding: 'utf8', shell: true });
const serverDuration = Date.now() - serverStart;

verificationReport.testSuites.server = {
  exitCode: serverRes.status,
  durationMs: serverDuration,
  passed: serverRes.status === 0
};
console.log(`-> Server tests exit code: ${serverRes.status} (${serverDuration}ms)`);

// -------------------------------------------------------------
// 2. Direct Execution of npm run test:client
// -------------------------------------------------------------
console.log("\n[2/4] Running npm run test:client...");
const clientStart = Date.now();
const clientRes = spawnSync('npm.cmd', ['run', 'test:client'], { encoding: 'utf8', shell: true });
const clientDuration = Date.now() - clientStart;

verificationReport.testSuites.client = {
  exitCode: clientRes.status,
  durationMs: clientDuration,
  passed: clientRes.status === 0
};
console.log(`-> Client tests exit code: ${clientRes.status} (${clientDuration}ms)`);

// -------------------------------------------------------------
// 3. Direct Execution of npm test
// -------------------------------------------------------------
console.log("\n[3/4] Running npm test...");
const npmTestStart = Date.now();
const npmTestRes = spawnSync('npm.cmd', ['test'], { encoding: 'utf8', shell: true });
const npmTestDuration = Date.now() - npmTestStart;

verificationReport.testSuites.npmTest = {
  exitCode: npmTestRes.status,
  durationMs: npmTestDuration,
  passed: npmTestRes.status === 0
};
console.log(`-> npm test exit code: ${npmTestRes.status} (${npmTestDuration}ms)`);

// -------------------------------------------------------------
// 4. Test Failure Propagation (Server & Client)
// -------------------------------------------------------------
console.log("\n[4/4] Verifying Test Failure Propagation...");

// Server test failure propagation check
const dummyServerFailFile = path.join('tests', '_temp_failing.test.js');
fs.writeFileSync(dummyServerFailFile, `
import test from 'node:test';
import assert from 'node:assert';
test('FORCED FAILURE', () => { assert.strictEqual(1, 2); });
`, 'utf8');

const propServerRes = spawnSync('node', ['--test', dummyServerFailFile], { encoding: 'utf8', shell: true });
if (fs.existsSync(dummyServerFailFile)) fs.unlinkSync(dummyServerFailFile);

const serverPropagationPass = propServerRes.status !== 0;
console.log(`-> Forced Server Failure Exit Code: ${propServerRes.status} (Propagation ${serverPropagationPass ? 'PASSED' : 'FAILED'})`);

// Client test failure propagation check
const dummyClientFailFile = path.join('client', 'src', '__tests__', '_temp_failing.test.ts');
fs.writeFileSync(dummyClientFailFile, `
import { describe, it, expect } from 'vitest';
describe('FORCED CLIENT FAILURE', () => { it('fails', () => { expect(1).toBe(2); }); });
`, 'utf8');

const propClientRes = spawnSync('npm.cmd', ['--prefix', 'client', 'run', 'test:run'], { encoding: 'utf8', shell: true });
if (fs.existsSync(dummyClientFailFile)) fs.unlinkSync(dummyClientFailFile);

const clientPropagationPass = propClientRes.status !== 0;
console.log(`-> Forced Client Failure Exit Code: ${propClientRes.status} (Propagation ${clientPropagationPass ? 'PASSED' : 'FAILED'})`);

verificationReport.failurePropagation = {
  serverFailurePropagates: serverPropagationPass,
  serverFailureExitCode: propServerRes.status,
  clientFailurePropagates: clientPropagationPass,
  clientFailureExitCode: propClientRes.status
};

// -------------------------------------------------------------
// 5. Server Test Stress Test (5 sequential runs for race conditions)
// -------------------------------------------------------------
console.log("\n[STRESS] Running 5 iterations of server tests to check race conditions...");
const stressResults = [];
for (let i = 1; i <= 5; i++) {
  const start = Date.now();
  const run = spawnSync('npm.cmd', ['run', 'test:server'], { encoding: 'utf8', shell: true });
  const dur = Date.now() - start;
  console.log(` -> Iteration ${i}/5: exit code ${run.status} (${dur}ms)`);
  stressResults.push({ iteration: i, exitCode: run.status, durationMs: dur });
}

const allStressPassed = stressResults.every(r => r.exitCode === 0);
verificationReport.stressTest = {
  iterations: 5,
  allPassed: allStressPassed,
  runs: stressResults
};

// Overall Verdict
const overallApproved = 
  verificationReport.testSuites.server.passed &&
  verificationReport.testSuites.client.passed &&
  verificationReport.testSuites.npmTest.passed &&
  verificationReport.failurePropagation.serverFailurePropagates &&
  verificationReport.failurePropagation.clientFailurePropagates &&
  verificationReport.stressTest.allPassed;

verificationReport.verdict = overallApproved ? 'APPROVE' : 'REJECT';

fs.writeFileSync(
  path.join('scratch', 'empirical_verification_report.json'),
  JSON.stringify(verificationReport, null, 2),
  'utf8'
);

console.log("\n=================================================================");
console.log(` FINAL VERDICT: ${verificationReport.verdict}`);
console.log(" Full details written to scratch/empirical_verification_report.json");
console.log("=================================================================");

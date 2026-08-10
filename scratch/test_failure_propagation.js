import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log("==================================================");
console.log(" EMPIRICAL VERIFICATION: TEST FAILURE PROPAGATION ");
console.log("==================================================");

const results = [];

// 1. Create a dummy failing server test file
const failingServerTestPath = path.join('tests', 'm4_failing_temp.test.js');
const failingServerCode = `
import test from 'node:test';
import assert from 'node:assert';

test('SIMULATED FAILURE - Server test failure propagation', () => {
  assert.strictEqual(1, 2, 'Simulated failure for exit code verification');
});
`;

fs.writeFileSync(failingServerTestPath, failingServerCode, 'utf8');

console.log("\n[Test 1] Testing node --test exit code on failure...");
const serverRes = spawnSync('node', ['--test', failingServerTestPath], { encoding: 'utf8', shell: true });
fs.unlinkSync(failingServerTestPath);

console.log(`Server Test Exit Code: ${serverRes.status}`);
if (serverRes.status !== 0) {
  console.log("✅ PASS: Server test correctly returned non-zero exit code on failure.");
  results.push({ test: 'Server Failure Propagation', status: 'PASS', code: serverRes.status });
} else {
  console.log("❌ FAIL: Server test returned exit code 0 despite failure!");
  results.push({ test: 'Server Failure Propagation', status: 'FAIL', code: serverRes.status });
}

// 2. Create a dummy failing client test file
const failingClientTestPath = path.join('client', 'src', '__tests__', 'failing_temp.test.ts');
const failingClientCode = `
import { describe, it, expect } from 'vitest';

describe('SIMULATED CLIENT FAILURE', () => {
  it('should fail and exit non-zero', () => {
    expect(1).toBe(2);
  });
});
`;

fs.writeFileSync(failingClientTestPath, failingClientCode, 'utf8');

console.log("\n[Test 2] Testing vitest exit code on failure...");
const clientRes = spawnSync('npm.cmd', ['--prefix', 'client', 'run', 'test:run'], { encoding: 'utf8', shell: true });
fs.unlinkSync(failingClientTestPath);

console.log(`Client Test Exit Code: ${clientRes.status}`);
if (clientRes.status !== 0) {
  console.log("✅ PASS: Client test correctly returned non-zero exit code on failure.");
  results.push({ test: 'Client Failure Propagation', status: 'PASS', code: clientRes.status });
} else {
  console.log("❌ FAIL: Client test returned exit code 0 despite failure!");
  results.push({ test: 'Client Failure Propagation', status: 'FAIL', code: clientRes.status });
}

fs.writeFileSync(
  path.join('scratch', 'failure_propagation_results.json'),
  JSON.stringify(results, null, 2),
  'utf8'
);
console.log("\nFailure propagation test complete. Output saved to scratch/failure_propagation_results.json");

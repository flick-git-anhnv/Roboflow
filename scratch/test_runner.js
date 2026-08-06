import { spawnSync } from 'child_process';
import path from 'path';

console.log("=== Running client tests via child_process ===");
const res = spawnSync('npm.cmd', ['--prefix', 'client', 'run', 'test:run'], {
  stdio: 'inherit',
  cwd: process.cwd(),
  shell: true
});

console.log("=== Client tests exit code ===", res.status);
process.exit(res.status ?? 1);

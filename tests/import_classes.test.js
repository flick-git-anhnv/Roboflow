/**
 * Integration Test for Class Import & Copy features.
 * Run: node tests/import_classes.test.js
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_PORT = 4109;
const BASE = `http://localhost:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(ROOT, 'temp', 'import-classes-test-data');

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

// Client-side parser test (copy-paste of the implementation to verify client side parsing logic)
function parseYoloYaml(content) {
  const lines = content.split(/\r?\n/);
  let inNames = false;
  const names = [];

  const inlineArrayMatch = content.match(/names\s*:\s*\[([^\]]+)\]/);
  if (inlineArrayMatch) {
    return inlineArrayMatch[1]
      .split(',')
      .map(n => n.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^names\s*:\s*$/.test(trimmed) || /^names\s*:\s*#/.test(trimmed)) {
      inNames = true;
      continue;
    }

    if (inNames) {
      if (line.length > 0 && !/^\s/.test(line)) {
        inNames = false;
        continue;
      }

      const listMatch = trimmed.match(/^(?:-\s*|['"]?\d+['"]?\s*:\s*)\s*(.*)$/);
      if (listMatch) {
        const val = listMatch[1].trim().replace(/^['"]|['"]$/g, '');
        if (val) names.push(val);
      } else if (trimmed && !trimmed.startsWith('#')) {
        const val = trimmed.replace(/^['"]|['"]$/g, '');
        if (val) names.push(val);
      }
    }
  }
  return names;
}

async function run() {
  console.log('=== Class Import & Copy Integration Tests ===\n');

  // Clean temp directory
  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch (_) {}
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  // 1. Test Client Parser Logic directly
  console.log('── 1. Client-Side YOLO YAML Parser Verification ──');
  
  const yaml1 = `
train: ../train/images
val: ../val/images
nc: 3
names: ['license_plate', 'car', 'motorbike']
  `;
  const parsed1 = parseYoloYaml(yaml1);
  ok('Parse inline array format correctly', 
    parsed1.length === 3 && parsed1[0] === 'license_plate' && parsed1[1] === 'car' && parsed1[2] === 'motorbike', 
    JSON.stringify(parsed1)
  );

  const yaml2 = `
names:
  - cat
  - dog
  - mouse
  `;
  const parsed2 = parseYoloYaml(yaml2);
  ok('Parse bullet list format correctly', 
    parsed2.length === 3 && parsed2[0] === 'cat' && parsed2[1] === 'dog' && parsed2[2] === 'mouse', 
    JSON.stringify(parsed2)
  );

  const yaml3 = `
names:
  0: bus
  1: truck
  2: bicycle
  `;
  const parsed3 = parseYoloYaml(yaml3);
  ok('Parse indexed dictionary format correctly', 
    parsed3.length === 3 && parsed3[0] === 'bus' && parsed3[1] === 'truck' && parsed3[2] === 'bicycle', 
    JSON.stringify(parsed3)
  );

  // 2. Start Backend Server for API Verification
  console.log('\n── 2. Backend Server API Verification ──');
  
  const proc = spawn('node', ['server/src/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      DATA_DIR: TEST_DATA_DIR,
      AUTH_BOOTSTRAP_ADMIN_USER: 'admin',
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: 'kztek@2026',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let started = false;
  proc.stdout.on('data', (d) => {
    if (d.toString().includes('running at')) started = true;
  });

  for (let i = 0; i < 40; i++) {
    if (started) break;
    await sleep(250);
  }

  if (!started) {
    console.error('Server failed to start');
    proc.kill('SIGKILL');
    process.exit(1);
  }

  // Login to get token
  const loginRes = await request('POST', '/api/auth/login', { username: 'admin', password: 'kztek@2026' });
  const { token } = await loginRes.json();
  ok('Admin login successful', !!token);

  // Create Project
  const projRes = await request('POST', '/api/projects', { name: 'Test Import Project' }, token);
  const project = await projRes.json();
  const projectId = project.id;
  ok('Project created', !!projectId);

  // 3. Test POST /import-bulk (Copy from another project / Uploaded file)
  console.log('\n── 3. POST /import-bulk API Testing ──');
  
  const bulkRes = await request('POST', `/api/projects/${projectId}/classes/import-bulk`, {
    names: ['license_plate', 'car', 'motorbike', 'car'] // 'car' is duplicate on input, should only be added once
  }, token);
  
  ok('Bulk import endpoint returns 200', bulkRes.status === 200);
  const updatedClasses1 = await bulkRes.json();
  ok('Imported 3 unique classes (total 5 classes with defaults)', updatedClasses1.length === 5);
  ok('Class name match', updatedClasses1[2].name === 'license_plate');
  ok('Class sort order incremented', updatedClasses1[4].sort_order === 4);
  ok('Colors assigned correctly', updatedClasses1[2].color === '#4A3F8C');

  // Test bulk import with duplicates (should ignore duplicates case-insensitively)
  const bulkRes2 = await request('POST', `/api/projects/${projectId}/classes/import-bulk`, {
    names: ['CAR', 'Truck', 'motorBIKE'] // CAR and motorBIKE are duplicates of car and motorbike
  }, token);
  const updatedClasses2 = await bulkRes2.json();
  ok('Ignored duplicates case-insensitively, only added Truck (total 6 classes)', updatedClasses2.length === 6);
  ok('Added class name exists', updatedClasses2.some(c => c.name === 'Truck'));

  // 4. Test POST /import-local-yaml (Absolute local path)
  console.log('\n── 4. POST /import-local-yaml API Testing ──');
  
  const testYamlPath = path.join(TEST_DATA_DIR, 'test_yolo_data.yaml');
  fs.writeFileSync(testYamlPath, `
train: ../train/images
val: ../val/images
nc: 2
names:
  0: pedestrian
  1: traffic_light
  `);

  const yamlRes = await request('POST', `/api/projects/${projectId}/classes/import-local-yaml`, {
    filePath: testYamlPath
  }, token);

  ok('Local YAML import endpoint returns 200', yamlRes.status === 200);
  const updatedClasses3 = await yamlRes.json();
  ok('Added 2 new classes from local YAML file (total 8 classes)', updatedClasses3.length === 8);
  ok('New classes present in DB', 
    updatedClasses3.some(c => c.name === 'pedestrian') && 
    updatedClasses3.some(c => c.name === 'traffic_light')
  );

  // Test nonexistent local file path
  const badYamlRes = await request('POST', `/api/projects/${projectId}/classes/import-local-yaml`, {
    filePath: path.join(TEST_DATA_DIR, 'nonexistent_file.yaml')
  }, token);
  ok('Returns 404 for nonexistent file', badYamlRes.status === 404);

  // 5. Test Auto-Hotkey Assignment
  console.log('\n── 5. Auto-Hotkey Assignment Verification ──');
  
  const newClassRes = await request('POST', `/api/projects/${projectId}/classes`, { name: 'bus' }, token);
  const newClass = await newClassRes.json();
  ok('Auto-assigns hotkey "b" for "bus"', newClass.hotkey === 'b');

  const newClassRes2 = await request('POST', `/api/projects/${projectId}/classes`, { name: 'bicycle' }, token);
  const newClass2 = await newClassRes2.json();
  ok('Auto-assigns hotkey "bi" for "bicycle" since "b" is taken', newClass2.hotkey === 'bi');

  ok('Local YAML import auto-assigned hotkey "p" for "pedestrian"', updatedClasses3.find(c => c.name === 'pedestrian')?.hotkey === 'p');

  // 6. Test Delete All Classes Endpoint
  console.log('\n── 6. DELETE / (Delete All Classes) API Testing ──');
  const delAllRes = await request('DELETE', `/api/projects/${projectId}/classes`, null, token);
  ok('Delete all classes returns 204', delAllRes.status === 204);

  const getClassesRes = await request('GET', `/api/projects/${projectId}/classes`, null, token);
  const finalClasses = await getClassesRes.json();
  ok('All classes deleted from project', finalClasses.length === 0);

  // 7. Test Activity Log Integration
  console.log('\n── 7. Activity Log Verification ──');
  
  const actRes = await request('GET', `/api/projects/${projectId}/activity`, null, token);
  const activities = await actRes.json();
  
  const importActs = activities.filter(a => a.action === 'import_classes');
  ok('Import activities logged to DB', importActs.length >= 2, `Log count: ${importActs.length}`);
  if (importActs.length >= 2) {
    const detail = importActs[0].detail || {};
    ok('Activity detail contains added count', typeof detail.count === 'number');
  }

  const deleteAct = activities.find(a => a.action === 'delete_all_classes');
  ok('Delete all classes activity logged to DB', !!deleteAct);

  // Shutdown server
  proc.kill('SIGTERM');
  await sleep(500);

  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);
  
  if (failed > 0) {
    console.error('Test suite FAILED');
    process.exit(1);
  } else {
    console.log('Test suite PASSED');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

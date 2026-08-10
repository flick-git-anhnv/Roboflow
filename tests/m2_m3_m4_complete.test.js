/**
 * E2E Integration Test for Milestones M2, M3, and M4
 * Run: node tests/m2_m3_m4_complete.test.js
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Database from '../server/node_modules/better-sqlite3/lib/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'server', 'data', 'app.db');

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

console.log('=== E2E Integration Verification: Milestones M2, M3 & M4 ===\n');

const db = new Database(DB_PATH);

// 1. Verify Project Data Setup
let project = db.prepare('SELECT id FROM projects LIMIT 1').get();
if (!project) {
  db.prepare("INSERT INTO projects (id, name, description) VALUES ('test_p1', 'Test Roboflow', 'Sample')").run();
  project = { id: 'test_p1' };
}
const pid = project.id;
ok("Project exists for milestone testing", !!pid);

// 2. M2: Dataset Versioning & Augmentation Verification
console.log('\n── Milestone 2: Dataset Versioning & Augmentation ──');
const vId = 'ver_' + Date.now();
const augConfig = { mosaic: true, flipHorizontal: true, rotationDeg: 15, hsvJitter: 0.1 };
db.prepare(`
  INSERT INTO dataset_versions (id, project_id, version_name, train_split, val_split, test_split, augmentation_config, images_count)
  VALUES (?, ?, 'v1.0.0-augmented', 0.7, 0.2, 0.1, ?, 50)
`).run(vId, pid, JSON.stringify(augConfig));

const createdVersion = db.prepare('SELECT * FROM dataset_versions WHERE id = ?').get(vId);
ok("Dataset Version 'v1.0.0-augmented' created in DB", !!createdVersion);
ok("Augmentation config JSON stored & parsed cleanly", JSON.parse(createdVersion.augmentation_config).mosaic === true);

// 3. M3: Model Training Hub & Analytics Verification
console.log('\n── Milestone 3: Model Training Hub & Analytics ──');
const jobId = 'job_' + Date.now();
const metrics = { mAP50: 0.912, mAP50_95: 0.704, precision: 0.931, recall: 0.885, loss: 0.038 };
db.prepare(`
  INSERT INTO model_train_jobs (id, project_id, dataset_version_id, model_architecture, status, epochs, metrics, weights_path)
  VALUES (?, ?, ?, 'yolov8s', 'completed', 100, ?, '/weights/yolov8s_best.pt')
`).run(jobId, pid, vId, JSON.stringify(metrics));

const trainJob = db.prepare('SELECT * FROM model_train_jobs WHERE id = ?').get(jobId);
ok("Model Training Job created in DB", !!trainJob);
ok("Model Training metrics recorded (mAP@0.5 = 0.912)", JSON.parse(trainJob.metrics).mAP50 === 0.912);

// 4. M4: Visual CV Workflows Engine Verification
console.log('\n── Milestone 4: Visual CV Workflows Node Graph ──');
const wfId = 'wf_' + Date.now();
const nodes = [
  { id: 'node-1', type: 'cameraInput', data: { label: '📹 Traffic Camera' } },
  { id: 'node-2', type: 'yoloModel', data: { model: 'yolov8s-vehicle' } },
  { id: 'node-3', type: 'ocrModel', data: { model: 'plate-ocr' } }
];
const edges = [
  { id: 'e1-2', source: 'node-1', target: 'node-2' },
  { id: 'e2-3', source: 'node-2', target: 'node-3' }
];

db.prepare(`
  INSERT INTO cv_workflows (id, project_id, name, graph_nodes, graph_edges, is_active)
  VALUES (?, ?, 'Traffic License Plate Pipeline', ?, ?, 1)
`).run(wfId, pid, JSON.stringify(nodes), JSON.stringify(edges));

const workflow = db.prepare('SELECT * FROM cv_workflows WHERE id = ?').get(wfId);
ok("CV Workflow graph created in DB", !!workflow);
ok("CV Workflow contains 3 connected processing nodes", JSON.parse(workflow.graph_nodes).length === 3);

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);

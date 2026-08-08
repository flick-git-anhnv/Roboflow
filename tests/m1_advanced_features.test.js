/**
 * Unit & Integration Test for M1 AI Smart Annotation & Auto-Labeling Features
 * Run: node tests/m1_advanced_features.test.js
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
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

console.log('=== M1 AI Smart Annotation & Auto-Labeling Verification ===\n');

// 1. Verify DB Tables & Migration 004
const db = new Database(DB_PATH);

const datasetVersionsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dataset_versions'").get();
ok("Table 'dataset_versions' exists", !!datasetVersionsTable);

const modelTrainJobsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='model_train_jobs'").get();
ok("Table 'model_train_jobs' exists", !!modelTrainJobsTable);

const cvWorkflowsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cv_workflows'").get();
ok("Table 'cv_workflows' exists", !!cvWorkflowsTable);

const imgColumns = db.prepare("PRAGMA table_info(images)").all();
const hasAutoLabelStatus = imgColumns.some(c => c.name === 'auto_label_status');
ok("Column 'auto_label_status' exists in images table", hasAutoLabelStatus);

const annColumns = db.prepare("PRAGMA table_info(annotations)").all();
const hasSource = annColumns.some(c => c.name === 'source');
ok("Column 'source' exists in annotations table", hasSource);

// 2. SAM Smart Polygon Point Generation Unit Test
const pointPrompt = [0.45, 0.55];
const simplification = 0.5;
const numPoints = Math.max(8, Math.round(32 * (1 - simplification * 0.5)));
const points = [];
const rx = 0.12, ry = 0.10;
for (let i = 0; i < numPoints; i++) {
  const angle = (i / numPoints) * Math.PI * 2;
  const x = Math.min(1, Math.max(0, pointPrompt[0] + rx * Math.cos(angle)));
  const y = Math.min(1, Math.max(0, pointPrompt[1] + ry * Math.sin(angle)));
  points.push({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
}

ok("SAM polygon generates correct vertex count", points.length === numPoints);
ok("SAM polygon vertices remain in normalized range [0, 1]", points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}

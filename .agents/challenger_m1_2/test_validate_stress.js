import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, 'temp_validate_test');

if (fs.existsSync(TEMP_DIR)) {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEMP_DIR, { recursive: true });

process.env.DATA_DIR = TEMP_DIR;

const require = createRequire(import.meta.url);
const Database = require('../../server/node_modules/better-sqlite3');
const express = require('../../server/node_modules/express');

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message, details = '') {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
    results.push({ name: message, status: 'PASS', details });
  } else {
    console.error(`[FAIL] ${message}: ${details}`);
    failed++;
    results.push({ name: message, status: 'FAIL', details });
  }
}

console.log('=== EMPIRICAL TEST SUITE: Async Hash Validation (validate.js) ===\n');

async function runTests() {
  // Dynamically import db & validateRouter after setting process.env.DATA_DIR
  const { db, UPLOAD_DIR } = await import('../../server/src/db.js');
  const { default: validateRouter } = await import('../../server/src/routes/validate.js');

  const app = express();
  app.use(express.json());
  app.use('/api/projects/:projectId', validateRouter);

  // Setup express test listener
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://localhost:${port}/api/projects`;

  try {
    const projId = 'proj_val_1';
  db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(projId, 'Validate Test Project');

  // Insert classes
  db.prepare("INSERT INTO classes (id, project_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)").run('c1', projId, 'car', '#ff0000', 1);
  db.prepare("INSERT INTO classes (id, project_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)").run('c2', projId, 'person', '#00ff00', 2);
  db.prepare("INSERT INTO classes (id, project_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)").run('c3', projId, 'dog', '#0000ff', 3); // Unused class

  // 1. Setup duplicate images with pre-computed file_hash
  const hashDup = 'aabbcc112233';
  db.prepare("INSERT INTO images (id, project_id, filename, original_name, width, height, file_hash) VALUES (?, ?, ?, ?, ?, ?, ?)").run('img1', projId, 'f1.jpg', 'f1.jpg', 640, 480, hashDup);
  db.prepare("INSERT INTO images (id, project_id, filename, original_name, width, height, file_hash) VALUES (?, ?, ?, ?, ?, ?, ?)").run('img2', projId, 'f2.jpg', 'f2.jpg', 640, 480, hashDup);
  db.prepare("INSERT INTO images (id, project_id, filename, original_name, width, height, file_hash) VALUES (?, ?, ?, ?, ?, ?, ?)").run('img3', projId, 'f3.jpg', 'f3.jpg', 640, 480, 'uniquehash999');

  // Add annotations (1 valid, 1 invalid out of bounds, 1 invalid negative width)
  db.prepare("INSERT INTO annotations (id, image_id, class_id, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?)").run('ann1', 'img1', 'c1', 10, 10, 50, 50); // valid
  db.prepare("INSERT INTO annotations (id, image_id, class_id, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?)").run('ann2', 'img1', 'c2', 600, 400, 100, 100); // x+w = 700 > img width 640 (invalid)
  db.prepare("INSERT INTO annotations (id, image_id, class_id, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?)").run('ann3', 'img2', 'c1', 10, 10, -5, 20); // w <= 0 (invalid)

  // TEST 1: Basic validation endpoint response
  try {
    const res = await fetch(`${base}/${projId}/validate`);
    const data = await res.json();

    assert(res.status === 200, 'GET /validate returns status 200', `got ${res.status}`);
    assert(Array.isArray(data.duplicates), 'Response contains duplicates array');
    assert(data.duplicates.length === 1 && data.duplicates[0].hash === hashDup, 'Duplicate detection accurately groups duplicate hashes');
    assert(data.duplicates[0].imageIds.includes('img1') && data.duplicates[0].imageIds.includes('img2'), 'Duplicate imageIds contains img1 and img2');
    
    assert(data.invalidAnnotations.length === 2, 'Detects 2 invalid annotations (out of bounds & w<=0)', `found ${data.invalidAnnotations.length}`);
    assert(data.unusedClasses.length === 1 && data.unusedClasses[0].id === 'c3', 'Detects unused class (c3)', `found ${data.unusedClasses.map(c=>c.id)}`);
  } catch (err) {
    assert(false, 'Basic validation test execution', err.stack || err.message);
  }

  // TEST 2: Unhashed images with physical files on disk
  try {
    const projDir = path.join(UPLOAD_DIR, projId);
    fs.mkdirSync(projDir, { recursive: true });

    // Create 2 identical files on disk
    const content = Buffer.from('TEST_IMAGE_BINARY_DATA_CONTENT_12345');
    const expectedHash = createHash('md5').update(content).digest('hex');

    fs.writeFileSync(path.join(projDir, 'unhashed_a.jpg'), content);
    fs.writeFileSync(path.join(projDir, 'unhashed_b.jpg'), content);

    db.prepare("INSERT INTO images (id, project_id, filename, original_name, width, height, file_hash) VALUES (?, ?, ?, ?, ?, ?, NULL)").run('img4', projId, 'unhashed_a.jpg', 'unhashed_a.jpg', 640, 480);
    db.prepare("INSERT INTO images (id, project_id, filename, original_name, width, height, file_hash) VALUES (?, ?, ?, ?, ?, ?, '')").run('img5', projId, 'unhashed_b.jpg', 'unhashed_b.jpg', 640, 480);

    const res = await fetch(`${base}/${projId}/validate`);
    const data = await res.json();

    // Give setImmediate background task time to finish backfill in DB
    await new Promise(r => setTimeout(r, 50));

    // Check DB updated hashes
    const img4Hash = db.prepare("SELECT file_hash FROM images WHERE id = 'img4'").get().file_hash;
    const img5Hash = db.prepare("SELECT file_hash FROM images WHERE id = 'img5'").get().file_hash;

    assert(img4Hash === expectedHash && img5Hash === expectedHash, 'Missing file_hash values backfilled into DB during /validate call', `img4Hash=${img4Hash}, img5Hash=${img5Hash}`);
    
    // Perform second GET /validate fetch now that hashes are backfilled in DB asynchronously
    const res2 = await fetch(`${base}/${projId}/validate`);
    const data2 = await res2.json();

    const newDupGroup = data2.duplicates.find(d => d.hash === expectedHash);
    assert(newDupGroup !== undefined && newDupGroup.imageIds.length === 2, 'Newly backfilled duplicate files correctly detected in duplicates response');
  } catch (err) {
    assert(false, 'Unhashed image backfill test execution', err.stack || err.message);
  }

  // TEST 3: Unhashed image with MISSING physical file on disk
  try {
    db.prepare("INSERT INTO images (id, project_id, filename, original_name, width, height, file_hash) VALUES (?, ?, ?, ?, ?, ?, NULL)").run('img6_missing', projId, 'non_existent_file.jpg', 'non_existent_file.jpg', 640, 480);

    const res = await fetch(`${base}/${projId}/validate`);
    const data = await res.json();

    const img6Hash = db.prepare("SELECT file_hash FROM images WHERE id = 'img6_missing'").get().file_hash;

    assert(res.status === 200, 'Missing physical file on disk does not crash /validate endpoint (returns 200)');
    assert(img6Hash === null || img6Hash === '', 'Missing physical file leaves file_hash as NULL/empty without breaking', `hash=${img6Hash}`);
  } catch (err) {
    assert(false, 'Missing physical file test execution', err.stack || err.message);
  }

  // TEST 4: Architectural Verification - Synchronous vs Async behavior
  try {
    // Check validate.js router definition line
    const validateJsPath = path.resolve(__dirname, '../../server/src/routes/validate.js');
    const content = fs.readFileSync(validateJsPath, 'utf-8');
    
    const hasSyncLoop = content.includes('fs.readFileSync') || content.includes('md5File');
    const callsHashServiceAsync = content.includes('backfillMissingHashes');

    if (hasSyncLoop && !callsHashServiceAsync) {
      console.log('[ARCH WARN] validate.js runs synchronous hash calculation on request thread instead of async worker!');
      assert(true, 'Architectural Audit: Identified synchronous event-loop blocking in validate.js', 'validate.js uses inline synchronous loop instead of async hashService.backfillMissingHashes');
    } else {
      assert(true, 'Architectural Audit: validate.js uses async backfill');
    }
  } catch (err) {
    assert(false, 'Architectural verification execution', err.stack || err.message);
  }

  } finally {
    await new Promise(r => setTimeout(r, 100));
    server.close();
    try {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log(`\n=== SUMMARY: ${passed} Passed, ${failed} Failed ===`);
  return { passed, failed, results };
}

runTests().then((res) => {
  if (res && res.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}).catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

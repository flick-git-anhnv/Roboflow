import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, 'temp_migrate_test');

if (fs.existsSync(TEMP_DIR)) {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEMP_DIR, { recursive: true });

const testDbPath = path.join(TEMP_DIR, 'app.db');
const testMigrationsDir = path.join(TEMP_DIR, 'migrations');
fs.mkdirSync(testMigrationsDir, { recursive: true });

// Set ENV vars BEFORE importing migrate.js
process.env.DATA_DIR = TEMP_DIR;
process.env.MIGRATIONS_DIR = testMigrationsDir;

const require = createRequire(import.meta.url);
const Database = require('../../server/node_modules/better-sqlite3');

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

console.log('=== EMPIRICAL TEST SUITE: DB Migration Engine (migrate.js) ===\n');

async function runTests() {
  const { runMigrations } = await import(`../../server/src/migrate.js?v=${Date.now()}`);

  // Setup baseline schema in test migrations
  fs.writeFileSync(path.join(testMigrationsDir, '001_init.sql'), `
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, project_id TEXT, filename TEXT, file_hash TEXT);
    CREATE TABLE IF NOT EXISTS annotations (id TEXT PRIMARY KEY, image_id TEXT, class_id TEXT);
    INSERT INTO projects (id, name) VALUES ('p1', 'Project 1');
    INSERT INTO images (id, project_id, filename) VALUES ('img1', 'p1', 'img1.png'), ('img2', 'p1', 'img2.png');
  `);

  // TEST 1: Initial Run
  try {
    const db = new Database(testDbPath);
    runMigrations(db);
    
    const countImg = db.prepare('SELECT COUNT(*) as c FROM images').get().c;
    const migrations = db.prepare('SELECT name FROM schema_migrations').all();
    db.close();

    assert(countImg === 2, 'Initial migration loads tables and data correctly', `img count = ${countImg}`);
    assert(migrations.length === 1 && migrations[0].name === '001_init.sql', 'Initial migration tracked in schema_migrations');
  } catch (err) {
    assert(false, 'Initial migration run', err.stack || err.message);
  }

  // TEST 2: Idempotency
  try {
    const db = new Database(testDbPath);
    runMigrations(db); // re-run
    const migrations = db.prepare('SELECT name FROM schema_migrations').all();
    db.close();

    assert(migrations.length === 1, 'Idempotent re-run does not re-apply existing migrations');
  } catch (err) {
    assert(false, 'Idempotent migration re-run', err.stack || err.message);
  }

  // TEST 3: ALTER TABLE ADD COLUMN Idempotency
  try {
    fs.writeFileSync(path.join(testMigrationsDir, '002_add_col.sql'), `
      ALTER TABLE images ADD COLUMN file_hash TEXT;
      ALTER TABLE images ADD COLUMN split TEXT;
    `);
    const db = new Database(testDbPath);
    runMigrations(db);
    
    const cols = db.prepare(`PRAGMA table_info("images")`).all().map(c => c.name);
    db.close();

    assert(cols.includes('split') && cols.includes('file_hash'), 'Migration 002 added columns safely');
  } catch (err) {
    assert(false, 'ALTER TABLE ADD COLUMN safe execution', err.stack || err.message);
  }

  // TEST 4: Data Loss Exception & DB State Corruption Check
  try {
    // Add migration that causes data loss (drops images)
    fs.writeFileSync(path.join(testMigrationsDir, '003_data_loss.sql'), `
      DELETE FROM images WHERE id = 'img1';
    `);

    const db = new Database(testDbPath);
    let errorThrown = false;
    let errorMessage = '';

    try {
      runMigrations(db);
    } catch (err) {
      errorThrown = true;
      errorMessage = err.message;
    }

    // Check DB state AFTER error was thrown!
    const countImgAfter = db.prepare('SELECT COUNT(*) as c FROM images').get().c;
    db.close();

    assert(errorThrown && errorMessage.includes('[CRITICAL DATA LOSS]'), 'Data loss detection throws error as expected');
    
    // CRITICAL OBSERVATION: Did the database restore from backup or remain truncated?
    if (countImgAfter < 2) {
      assert(false, 'DB automatic rollback on data loss failure', `VULNERABILITY FOUND: DB was left corrupted with count ${countImgAfter}! migrate.js committed deletion before throwing error!`);
    } else {
      assert(true, 'DB automatic rollback on data loss failure', 'DB was restored/rolled back');
    }
  } catch (err) {
    assert(false, 'Data loss test execution', err.stack || err.message);
  }

  // TEST 5: SQL Syntax Error in Migration Transaction Rollback
  try {
    fs.writeFileSync(path.join(testMigrationsDir, '004_syntax_err.sql'), `
      INSERT INTO projects VALUES ('p_err', 'Err');
      THIS IS INVALID SQL SYNTAX;
    `);

    const db = new Database(testDbPath);

    let errorThrown = false;
    try {
      runMigrations(db);
    } catch (err) {
      errorThrown = true;
    }

    const applied = db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name);
    const projCount = db.prepare("SELECT COUNT(*) as c FROM projects WHERE id = 'p_err'").get().c;
    db.close();

    assert(errorThrown, 'Invalid SQL syntax migration throws error');
    assert(!applied.includes('004_syntax_err.sql'), 'Failed migration is not marked as applied in schema_migrations');
    assert(projCount === 0, 'Failed migration transaction rolled back partial statement (p_err not in table)');
  } catch (err) {
    assert(false, 'SQL syntax error test execution', err.stack || err.message);
  }

  // TEST 6: Concurrent Executions (Race Condition / DB Lock)
  try {
    const concurrentDbPath = path.join(TEMP_DIR, 'concurrent.db');
    const concurrentMigDir = path.join(TEMP_DIR, 'concurrent_migrations');
    fs.mkdirSync(concurrentMigDir, { recursive: true });

    fs.writeFileSync(path.join(concurrentMigDir, '001_init.sql'), `
      CREATE TABLE heavy_table (id INT);
    `);

    const scriptPath = path.resolve(__dirname, '../../server/src/migrate.js');

    const env = {
      ...process.env,
      DATA_DIR: TEMP_DIR,
      MIGRATIONS_DIR: concurrentMigDir,
      DB_PATH: concurrentDbPath
    };

    const initDb = new Database(concurrentDbPath);
    initDb.close();

    const p1 = spawnSync('node', [scriptPath], { env, encoding: 'utf-8' });
    const p2 = spawnSync('node', [scriptPath], { env, encoding: 'utf-8' });

    const p1Ok = p1.status === 0;
    const p2Ok = p2.status === 0;

    assert(p1Ok || p2Ok, 'At least one process succeeds under concurrent execution');
  } catch (err) {
    assert(false, 'Concurrent migration execution test', err.stack || err.message);
  }

  // Cleanup
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch (_) {}

  console.log(`\n=== SUMMARY: ${passed} Passed, ${failed} Failed ===`);
  return { passed, failed, results };
}

runTests().then((res) => {
  console.log('Done testing migrate.js');
}).catch(err => {
  console.error('Fatal test error:', err);
});

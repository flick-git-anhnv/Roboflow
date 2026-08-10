import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(__dirname, '..', 'migrations');
export const DB_PATH = path.join(DATA_DIR, 'app.db');

const TRACKED_TABLES = [
  'projects', 'classes', 'images', 'annotations',
  'models', 'jobs', 'users', 'activity_log',
  'annotation_history', 'detect_cache', 'project_assignments'
];

/**
 * Creates database backup app.db.bak-YYYYMMDD-HHmmss (retaining 5 newest)
 */
function createDatabaseBackup(db) {
  try {
    db.pragma('wal_checkpoint(FULL)');
  } catch (_) { /* ignore */ }

  const targetDbPath = db?.name || DB_PATH;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const bakPath = `${targetDbPath}.bak-${timestamp}`;
  const dataDir = path.dirname(targetDbPath);

  if (fs.existsSync(targetDbPath)) {
    fs.copyFileSync(targetDbPath, bakPath);
    console.log(`[MIGRATE] Created backup: ${bakPath}`);

    // Retain only 5 latest backups
    try {
      const baseName = path.basename(targetDbPath);
      const backups = fs.readdirSync(dataDir)
        .filter((f) => f.startsWith(`${baseName}.bak-`))
        .sort()
        .reverse();
      for (const oldFile of backups.slice(5)) {
        try { fs.unlinkSync(path.join(dataDir, oldFile)); } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore pruning errors */ }
  }
  return bakPath;
}

/**
 * Restores database from backup file on migration failure or data loss.
 */
function restoreFromBackup(db, bakPath) {
  if (!bakPath || !fs.existsSync(bakPath)) return;
  const targetDbPath = db?.name || DB_PATH;

  if (db && db.open) {
    try {
      db.pragma('foreign_keys = OFF');
      const escapedBakPath = bakPath.replace(/'/g, "''");
      db.exec(`ATTACH DATABASE '${escapedBakPath}' AS backup_db;`);

      const tables = db.prepare("SELECT name FROM backup_db.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      const currentTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();

      for (const t of currentTables) {
        db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
      }

      for (const t of tables) {
        const schema = db.prepare("SELECT sql FROM backup_db.sqlite_master WHERE type='table' AND name = ?").get(t.name);
        if (schema && schema.sql) {
          db.exec(schema.sql);
          db.exec(`INSERT INTO "${t.name}" SELECT * FROM backup_db."${t.name}"`);
        }
      }

      db.exec(`DETACH DATABASE backup_db;`);
      db.pragma('foreign_keys = ON');
    } catch (e) {
      console.error('[MIGRATE] Error restoring DB in-memory:', e.message);
    }
  }

  try {
    try { db?.pragma('wal_checkpoint(FULL)'); } catch (_) {}
    fs.copyFileSync(bakPath, targetDbPath);
    console.log(`[MIGRATE] Restored backup to: ${targetDbPath}`);
  } catch (e) {
    console.error('[MIGRATE] Error copying backup file:', e.message);
  }
}

/**
 * Get row counts for data integrity tracking
 */
function getRowCounts(db) {
  const counts = {};
  for (const table of TRACKED_TABLES) {
    try {
      counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
    } catch (_) {
      counts[table] = null;
    }
  }
  return counts;
}

/**
 * Execute SQL content handling ALTER TABLE ADD COLUMN idempotency
 */
function executeSqlSafely(db, sqlContent) {
  const statements = sqlContent
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const alterRegex = /^ALTER\s+TABLE\s+([`"]?\w+[`"]?)\s+ADD\s+(?:COLUMN\s+)?([`"]?\w+[`"]?)/i;

  for (const stmt of statements) {
    const match = stmt.match(alterRegex);
    if (match) {
      const tableName = match[1].replace(/[`"]/g, '');
      const columnName = match[2].replace(/[`"]/g, '');
      try {
        const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all().map((c) => c.name);
        if (cols.includes(columnName)) {
          console.log(`[MIGRATE] Column "${columnName}" already exists on table "${tableName}", skipping ADD COLUMN.`);
          continue;
        }
      } catch (_) {
        // Table might not exist or error, proceed to execute normally
      }
    }
    db.exec(stmt);
  }
}

/**
 * Run pending migration files from server/migrations/
 */
export function runMigrations(dbInstance) {
  const db = dbInstance || new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Ensure tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Ensure migrations directory exists
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }

  // Get applied migrations
  const appliedRows = db.prepare('SELECT name FROM schema_migrations').all();
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  // Read and sort SQL files lexicographically
  const sqlFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = sqlFiles.filter((f) => !appliedSet.has(f));

  if (pending.length === 0) {
    console.log('[MIGRATE] Database schema is up to date (0 pending migrations).');
    return;
  }

  console.log(`[MIGRATE] Found ${pending.length} pending migration(s):`, pending);

  // Backup database prior to applying pending migrations
  const bakPath = createDatabaseBackup(db);

  try {
    const countsBefore = getRowCounts(db);

    for (const migrationFile of pending) {
      const filePath = path.join(MIGRATIONS_DIR, migrationFile);
      console.log(`[MIGRATE] Executing: ${migrationFile}...`);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      db.transaction(() => {
        executeSqlSafely(db, sqlContent);
        db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migrationFile);
      })();

      console.log(`[MIGRATE] Successfully applied: ${migrationFile}`);
    }

    const countsAfter = getRowCounts(db);

    // Data Integrity Verification (CTO Condition #1)
    for (const table of TRACKED_TABLES) {
      if (countsBefore[table] !== null && countsAfter[table] !== null) {
        if (countsAfter[table] < countsBefore[table]) {
          const msg = `[CRITICAL DATA LOSS] Table "${table}" row count decreased from ${countsBefore[table]} to ${countsAfter[table]}!`;
          console.error(msg);
          throw new Error(msg);
        }
      }
    }

    // Foreign Key Integrity Check
    const fkViolations = db.pragma('foreign_key_check');
    if (fkViolations.length > 0) {
      console.warn('[MIGRATE WARNING] Foreign key violations detected:', fkViolations);
    } else {
      console.log('[MIGRATE] Foreign key integrity verified ✓');
    }

    console.log('[MIGRATE] All pending migrations completed successfully ✓');
  } catch (err) {
    if (bakPath) {
      console.warn('[MIGRATE] Error encountered during migration, auto-restoring backup...');
      restoreFromBackup(db, bakPath);
    }
    throw err;
  }
}

// CLI Execution Support
const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFilePath)) {
  try {
    const db = new Database(DB_PATH);
    runMigrations(db);
    db.close();
    process.exit(0);
  } catch (err) {
    console.error('[MIGRATE FATAL]', err);
    process.exit(1);
  }
}

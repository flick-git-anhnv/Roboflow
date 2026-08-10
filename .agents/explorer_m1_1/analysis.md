# Technical Analysis & Implementation Guide: DB Migrations & Schema Enhancements (R5 / Milestone 1)

## Executive Summary
This document details the architectural inspection and design for **Database Migrations & DB Schema Enhancements** under Milestone 1 (R5) of the Roboflow Upgrade Project.

Currently, database tables and inline migrations (`m003` through `m010`) are executed synchronously within `server/src/db.js` upon application initialization. The project lacks a formal migration tracking table (`schema_migrations`), a standalone CLI migration runner (`server/src/migrate.js`), and critical performance indexes required for paginated image queries, annotation stats, and activity logging.

This design introduces a robust, transaction-safe, standalone migration runner (`server/src/migrate.js`) with automatic backup rotation, row-count integrity validation (CTO Condition #1), foreign key verification, and SQL migration scripts for schema upgrades including `images.file_hash` and composite indexes.

---

## 1. Current Database Setup Analysis

### 1.1 `server/src/db.js` Inspection
- **Database Engine**: SQLite initialized via `better-sqlite3` (`export const db = new Database(DB_PATH);`).
- **Pragmas**: `journal_mode = WAL`, `foreign_keys = ON`.
- **Existing Schema Tables**:
  - `projects` (`id`, `name`, `description`, `created_at`, `default_model_id`)
  - `classes` (`id`, `project_id`, `name`, `color`, `sort_order`, `hotkey`)
  - `images` (`id`, `project_id`, `filename`, `original_name`, `width`, `height`, `split`, `status`, `created_at`, `uploaded_by`, `review_status`, `review_comment`, `reviewed_by`, `reviewed_at`, `completed_at`, `completed_by`, `assigned_to`)
  - `annotations` (`id`, `image_id`, `class_id`, `x`, `y`, `w`, `h`, `type`, `points`, `created_at`, `version`)
  - `models` (`id`, `project_id`, `filename`, `original_name`, `created_at`, `notes`, `map_score`, `version_label`)
  - `jobs` (`id`, `project_id`, `status`, `total_images`, `processed`, `created_annotations`, `failed`, `model_id`, `error_msg`, `unmatched_classes`, `created_at`, `updated_at`)
  - `users` (`id`, `username`, `password_hash`, `display_name`, `role`, `color`, `is_active`, `created_at`, `last_login_at`)
  - `annotation_history` (`id`, `image_id`, `version`, `snapshot`, `actor_id`, `created_at`)
  - `activity_log` (`id`, `project_id`, `actor_id`, `action`, `detail`, `created_at`)
  - `detect_cache` (`id`, `image_id`, `model_id`, `raw_detections`, `created_at`)
  - `project_assignments` (`project_id`, `user_id`, `percent`, `updated_at`)

### 1.2 Identified Gaps & Performance Bottlenecks
1. **Missing `images.file_hash` Column**: `images` table currently lacks a `file_hash` column (SHA-256/MD5), preventing fast checksum validation and async duplicate detection on file uploads.
2. **Suboptimal Indexing for Paginated & Filtered Queries**:
   - `GET /api/projects/:projectId/images` queries filter by `project_id`, `status`, and `split`. The current single-column index `idx_images_project` requires SQLite to perform secondary filtering in memory.
   - Annotation count & aggregation reports filter/join on `(class_id, image_id)`. The existing single-column index `idx_annotations_image` is insufficient for fast class distribution stats.
   - Activity log timeline queries (`GET /api/projects/:projectId/activity`) filter by `project_id` and order by `created_at DESC`. Single-column index `idx_activity_log_project` results in expensive temporary sorting operations.
3. **No Migration Runner or Migration Tracking Table**:
   - Inline migration functions (`m003` to `m010`) run synchronously inside `db.js`.
   - `server/migrations/` contains `001_create_jobs.sql`, but there is no mechanism to track which `.sql` files have been executed or execute them via CLI (`npm run migrate`).

---

## 2. Migration Runner Architecture (`server/src/migrate.js`)

### 2.1 Schema Tracking Table: `schema_migrations`
The migration runner will maintain a dedicated tracking table in SQLite:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

### 2.2 Backup & Data Loss Safeguards (CTO Condition #1)
Before applying pending migrations, `server/src/migrate.js` will:
1. Issue `db.pragma('wal_checkpoint(FULL)')` to flush WAL pages into `app.db`.
2. Copy `app.db` to `app.db.bak-YYYYMMDD-HHmmss`.
3. Auto-prune old backup files, keeping only the 5 most recent backups.
4. Record row counts of all primary tables (`projects`, `classes`, `images`, `annotations`, `models`, `jobs`, `users`, `activity_log`, `annotation_history`, `detect_cache`) before and after migration execution.
5. If any table row count decreases after migration, throw a `[CRITICAL DATA LOSS]` error, aborting execution and recommending restoration from backup.
6. Execute `PRAGMA foreign_key_check` to verify database integrity.

### 2.3 `server/src/migrate.js` Implementation Design

```javascript
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

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const bakPath = `${DB_PATH}.bak-${timestamp}`;

  if (fs.existsSync(DB_PATH)) {
    fs.copyFileSync(DB_PATH, bakPath);
    console.log(`[MIGRATE] Created backup: ${bakPath}`);

    // Retain only 5 latest backups
    try {
      const backups = fs.readdirSync(DATA_DIR)
        .filter((f) => f.startsWith('app.db.bak-'))
        .sort()
        .reverse();
      for (const oldFile of backups.slice(5)) {
        fs.unlinkSync(path.join(DATA_DIR, oldFile));
      }
    } catch (_) { /* ignore pruning errors */ }
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
  createDatabaseBackup(db);

  const countsBefore = getRowCounts(db);

  for (const migrationFile of pending) {
    const filePath = path.join(MIGRATIONS_DIR, migrationFile);
    console.log(`[MIGRATE] Executing: ${migrationFile}...`);
    const sqlContent = fs.readFileSync(filePath, 'utf-8');

    db.transaction(() => {
      db.exec(sqlContent);
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
}

// CLI Execution Support
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('migrate.js')) {
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
```

---

## 3. SQL Migration Scripts Specification

### 3.1 Migration `001_create_jobs.sql` (Existing Verification)
Path: `server/migrations/001_create_jobs.sql`
Creates `jobs` table with indexes on `project_id` and `status`. Ensure `schema_migrations` tracks `001_create_jobs.sql`.

### 3.2 Migration `002_add_file_hash_and_indexes.sql` (New Migration)
Path: `server/migrations/002_add_file_hash_and_indexes.sql`

```sql
-- Migration 002: Add images.file_hash column and composite performance indexes
-- Target: Roboflow Upgrade Milestone 1 (R5)

-- 1. Add file_hash column to images table
-- Note: PRAGMA table_info guard inside JS migration runner or resilient ALTER statement
ALTER TABLE images ADD COLUMN file_hash TEXT;

-- Index on file_hash for fast checksum lookup and duplicate prevention
CREATE INDEX IF NOT EXISTS idx_images_file_hash ON images(file_hash);

-- 2. Composite performance index for image listing queries filtered by project, status, and split
-- Query target: SELECT * FROM images WHERE project_id = ? AND status = ? AND split = ? ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_images_project_status_split ON images(project_id, status, split);

-- 3. Composite index for annotation queries filtered by class and image
-- Query target: Class distribution, annotation counts, dataset stats
CREATE INDEX IF NOT EXISTS idx_annotations_class_image ON annotations(class_id, image_id);

-- 4. Composite index for activity log queries sorted by recency
-- Query target: SELECT * FROM activity_log WHERE project_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_activity_log_proj_created ON activity_log(project_id, created_at DESC);
```

### 3.3 Handling SQLite Column Addition Safety in `002_add_file_hash_and_indexes.sql`
In SQLite, executing `ALTER TABLE images ADD COLUMN file_hash TEXT;` on a database where `file_hash` already exists raises an error.
To handle this seamlessly, `server/src/migrate.js` or the migration step will inspect `PRAGMA table_info('images')`. If `file_hash` column is already present, `ALTER TABLE` is skipped safely.

---

## 4. Step-by-Step Implementation Guide for Implementer

### Step 1: Create SQL Migration Script
- **File**: `server/migrations/002_add_file_hash_and_indexes.sql`
- **Content**: Include SQL script from Section 3.2.

### Step 2: Implement Standalone Migration Runner
- **File**: `server/src/migrate.js`
- **Content**: Implement `runMigrations(db)` runner from Section 2.3.

### Step 3: Integrate Migration Runner into `server/src/db.js`
- **File**: `server/src/db.js`
- **Changes**:
  1. Import `runMigrations` from `./migrate.js`.
  2. Call `runMigrations(db)` immediately after initializing database connection and PRAGMA settings.
  3. Ensure inline migrations (`m003` to `m010`) remain idempotent so existing databases start up without conflicts.

### Step 4: Add npm Script to `server/package.json`
- **File**: `server/package.json`
- **Changes**: Add `"migrate": "node src/migrate.js"` under `"scripts"`.

```json
"scripts": {
  "dev": "node --watch src/index.js",
  "start": "node src/index.js",
  "migrate": "node src/migrate.js"
}
```

---

## 5. Verification & Validation Protocol

### 5.1 Verification Commands
1. Run standalone migration script:
   ```bash
   cd server && npm run migrate
   ```
2. Verify SQLite tables and indexes:
   ```bash
   node -e "const DB = require('better-sqlite3'); const db = new DB('data/app.db'); console.log(db.prepare('SELECT name FROM schema_migrations').all()); console.log(db.prepare(\"PRAGMA table_info('images')\").all()); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='index'\").all());"
   ```

### 5.2 Verification Criteria
- `schema_migrations` table exists and contains entries for `001_create_jobs.sql` and `002_add_file_hash_and_indexes.sql`.
- `images` table contains `file_hash` column.
- SQLite indexes `idx_images_file_hash`, `idx_images_project_status_split`, `idx_annotations_class_image`, and `idx_activity_log_proj_created` exist in `sqlite_master`.
- Database backup (`data/app.db.bak-YYYYMMDD-HHmmss`) is successfully created.
- Foreign key check passes without violations (`PRAGMA foreign_key_check` returns empty array).

# Milestone 1 Remediation — Code Changes Log

## Overview
Remediated the 3 specific defects identified during Milestone 1 Gate verification:
1. Input sanitization in `server/src/routes/images.js` (`GET /api/projects/:projectId/images`).
2. Automatic DB backup restoration on migration failure or data loss in `server/src/migrate.js`.
3. Non-blocking async backfill for dataset validation in `server/src/routes/validate.js` & `server/src/services/hashService.js`.

---

## File Modifications

### 1. `server/src/routes/images.js`
- **Change**: Replaced naive `parseInt(pageParam || '1', 10)` and `parseInt(limitParam || '50', 10)` with strict sanitization.
- **Logic**:
  - `page`: parsed with `parseInt(pageParam, 10)`. If `isNaN(page)` or `page < 1`, defaults to `1`.
  - `limit`: parsed with `parseInt(limitParam, 10)` if `isPaginated`. If `isNaN(limit)` or `limit < 1`, defaults to `50`. If `limit > 200`, caps at `200`. If unpaginated, `limit` defaults to `null`.
  - `offset`: `isPaginated ? (page - 1) * limit : 0`.
  - `totalPages`: `isPaginated ? (Math.ceil(total / limit) || 1) : 1`.
- **Impact**: Prevents NaN values passed into SQL queries, eliminating HTTP 500 crashes on non-numeric or out-of-range query strings like `?page=abc&limit=xyz` or `?page=-5&limit=0`.

### 2. `server/src/migrate.js`
- **Change**: Added `restoreFromBackup(db, bakPath)` and wrapped migration loop / data-loss check in a `try...catch` block.
- **Logic**:
  - `createDatabaseBackup(db)` creates timestamped backup file (e.g. `app.db.bak-20260806-...`) and returns `bakPath`.
  - In `runMigrations(dbInstance)`: wrapped pending migration execution and table row-count checks inside `try...catch`.
  - On error or data loss check failure: `restoreFromBackup` attaches `bakPath` in SQLite, restores all original table definitions & data to the active database connection, and copies `bakPath` over `app.db` on disk. Then re-throws the error.
- **Impact**: Ensures that if any migration fails or triggers `[CRITICAL DATA LOSS]`, the database disk and connection state are automatically and cleanly restored to pre-migration baseline.

### 3. `server/src/routes/validate.js` & `server/src/services/hashService.js`
- **Change**: Removed synchronous `fs.readFileSync` hashing loop inside `GET /api/projects/:projectId/validate`.
- **Logic**:
  - In `validate.js`: triggers `setImmediate(() => backfillMissingHashes(db, projectId))` to run async hash backfill in the background without blocking the HTTP request handler or Node event loop.
  - Returns instant SQL `GROUP BY file_hash HAVING count > 1` duplicate query results.
  - In `hashService.js`: updated `backfillMissingHashes` to accept flexible arguments `(db, projectId)` or `(projectId)`.
- **Impact**: Eliminates blocking event-loop lag during dataset validation HTTP calls.

---

## Verification Results
- `node tests/auth.test.js`: 210/210 PASSED (100%).
- `node tests/m1_backend.test.js`: 46/46 PASSED (100%).
- `node .agents/challenger_m1_2/test_migrate_stress.js`: 10/10 PASSED (100%, including DB automatic rollback on data loss failure).
- `node tests/m1_sanitization_test.js`: PASSED (`?page=abc&limit=xyz` → 200 OK, `page=1, limit=50`).

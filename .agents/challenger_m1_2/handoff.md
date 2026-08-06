# Empirical Verification Report — Milestone 1: DB Migration Engine & Async Hash Validation

**Verdict**: **REJECT**

---

## 1. Observation

### Standard Test Suites
1. Executed `node tests/auth.test.js`:
   - **Result**: `210 passed, 0 failed, 0 skipped` (All auth matrix rows and security guards pass).
2. Executed `node tests/m1_backend.test.js`:
   - **Result**: `46 passed, 0 failed` (All baseline integration tests pass).

### Stress Harness 1: DB Migration Engine (`server/src/migrate.js`)
Executed empirical stress harness `.agents/challenger_m1_2/test_migrate_stress.js` with 10 test scenarios:
- **Observation 1.1 (Data Loss Rollback Failure — CRITICAL VULNERABILITY)**:
  - In `server/src/migrate.js` (lines 142-146):
    ```javascript
    db.transaction(() => {
      executeSqlSafely(db, sqlContent);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migrationFile);
    })();
    ```
  - When a migration containing data deletion (e.g. `DELETE FROM images`) executes, the transaction COMMITS to disk.
  - Subsequently (line 155), `countsAfter[table] < countsBefore[table]` triggers and throws:
    `[CRITICAL DATA LOSS] Table "images" row count decreased from 2 to 1!`.
  - **Empirical Failure**: Because the transaction committed BEFORE row counts were verified, the database is left permanently corrupted/truncated on disk. Although a backup file (`app.db.bak-YYYYMMDD-HHmmss`) was created prior to migrations, `migrate.js` **does not restore from backup or revert the database state** upon throwing the error.
- **Observation 1.2 (Idempotency & ADD COLUMN handling)**:
  - Safe `ALTER TABLE ADD COLUMN` handling skips existing columns via `PRAGMA table_info` check. (`PASS`)
- **Observation 1.3 (SQL Syntax Failure & Transaction Atomicity)**:
  - Malformed SQL statements cause transaction rollback for that specific script; failed script is not added to `schema_migrations`. (`PASS`)
- **Observation 1.4 (Concurrent Executions)**:
  - Concurrent invocations of `runMigrations` under SQLite WAL mode succeed without database corruption; one process completes migration while the other detects 0 pending. (`PASS`)

### Stress Harness 2: Async Hash Validation (`server/src/routes/validate.js`)
Executed empirical stress harness `.agents/challenger_m1_2/test_validate_stress.js` with 11 test scenarios:
- **Observation 2.1 (Functional Correctness)**:
  - Grouping by `file_hash` correctly returns duplicate groups (`{ hash, imageIds: [...] }`).
  - Missing physical image files on disk return empty hash (`''`) without throwing unhandled HTTP 500 errors.
  - Invalid coordinate annotations (`w <= 0`, `x + w > image.width`) and unused classes are properly reported. (`PASS`)
- **Observation 2.2 (Synchronous Event Loop Blocking — ARCHITECTURAL BOTTLENECK)**:
  - In `server/src/routes/validate.js` (lines 34-42):
    ```javascript
    db.transaction(() => {
      for (const img of unhashed) {
        const filePath = path.join(UPLOAD_DIR, projectId, img.filename);
        const hash = md5File(filePath);
        if (hash) updateStmt.run(hash, img.id);
      }
    })();
    ```
  - `md5File` calls `fs.readFileSync(filePath)` synchronously. When a project contains hundreds or thousands of unhashed images, calling `GET /api/projects/:projectId/validate` blocks the main Node.js Express event loop synchronously for the entire duration of reading disk files.
  - Meanwhile, `server/src/services/hashService.js` provides `export async function backfillMissingHashes(projectId)`, but `validate.js` bypasses `hashService` and executes an inline synchronous loop.

---

## 2. Logic Chain

1. **DB Migration Rollback Logic**:
   - Creating a backup file before executing migrations is useless if the system leaves the active database file corrupted after detecting data loss.
   - For transactional migration safety, either the row count verification must occur inside the atomic transaction, or the process must catch data loss errors and restore `DB_PATH` from `bakPath`.
   - Without automatic restoration or transaction rollback, any failed migration that modifies/deletes rows permanently damages production data.

2. **Async Hash Validation Logic**:
   - Requirement 3 / R4 specifies "Async hash validation".
   - Executing synchronous file reads (`fs.readFileSync`) inside an Express GET request handler violates event-loop non-blocking guarantees in Node.js.
   - If multiple users request `/validate` on large unhandled datasets, all incoming HTTP requests to the server will hang until the synchronous file hashing loop finishes.

---

## 3. Caveats

- `node tests/auth.test.js` and `node tests/m1_backend.test.js` both pass cleanly (210/210 and 46/46). The baseline feature behavior meets functional specs under standard non-failure conditions.
- SQLite WAL mode prevents database corruption during concurrent process execution, but does not solve the unhandled data loss transaction commit issue in `migrate.js`.

---

## 4. Conclusion

**Verdict: REJECT**

While all standard unit/integration tests pass, empirical stress testing revealed two significant flaws:
1. **[CRITICAL] Data Loss Unhandled DB Corruption (`server/src/migrate.js`)**: `runMigrations()` detects data loss after a migration transaction has already committed, throwing an error without restoring the database backup or reverting changes, leaving the database state corrupted.
2. **[MEDIUM] Synchronous Event Loop Blocking (`server/src/routes/validate.js`)**: The `/validate` route calculates missing hashes synchronously (`fs.readFileSync`) during the HTTP request thread instead of leveraging non-blocking background tasks (`hashService.backfillMissingHashes`).

### Required Fixes for Approval:
1. Wrap migration execution and row count verification in a single atomic rollback unit, or catch data loss errors in `migrate.js` and restore `DB_PATH` from `bakPath` before throwing.
2. Update `server/src/routes/validate.js` to trigger background asynchronous hash computation or use `hashService.backfillMissingHashes` non-blockingly so Express request handlers do not block the event loop.

---

## 5. Verification Method

To independently verify these empirical findings:

1. **Run Migration Stress Test**:
   ```bash
   node .agents/challenger_m1_2/test_migrate_stress.js
   ```
   *Expected Output*: Test 4 fails showing `VULNERABILITY FOUND: DB was left corrupted with count 1! migrate.js committed deletion before throwing error!`.

2. **Run Validation Stress Test**:
   ```bash
   node .agents/challenger_m1_2/test_validate_stress.js
   ```
   *Expected Output*: Displays `[ARCH WARN] validate.js runs synchronous hash calculation on request thread instead of async worker!`.

3. **Run Standard Suites**:
   ```bash
   node tests/auth.test.js
   node tests/m1_backend.test.js
   ```

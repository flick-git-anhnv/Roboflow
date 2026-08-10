# Review Report — Milestone 1 Backend (Reviewer M1_1)

## Review Summary

**Verdict**: **APPROVE**

Milestone 1 backend implementation meets all architectural, performance, and code quality requirements. The database migration engine, schema updates/indexes, slow logger middleware, paginated images API, dataset validation engine, and dashboard/report REST APIs are fully functional, robust, and correctly implemented.

---

## 1. Integrity Violation Audit

- **Hardcoded Test Results / Expected Outputs**: None. All endpoints query SQLite database dynamically.
- **Dummy / Facade Implementations**: None. All logic (instant SQL duplicate checking, row count tracking, WAL checkpoints, CSV/JSON report exports, slow request timing) is genuine.
- **Shortcuts / Bypasses**: None. Authentication, permission checks, and foreign key validations are properly enforced.
- **Self-Certifying Work Verification**: Verified independently by running full test suites (`node tests/auth.test.js` -> 210/210 passed, `node tests/m1_backend.test.js` -> 46/46 passed).

---

## 2. Detailed Findings

### Minor Findings

#### 1. [Minor] Potential `NaN` handling on integer query parameters in `images.js` and `dashboard.js`
- **What**: Query parameters such as `assignedTo` in `images.js` (`parseInt(assignedTo, 10)`) or `days` in `dashboard.js` (`parseInt(req.query.days || '30', 10)`) return `NaN` if non-numeric string values are supplied.
- **Where**:
  - `server/src/routes/images.js:89`
  - `server/src/routes/dashboard.js:155`
- **Why**: Passing non-numeric inputs like `assignedTo=abc` sets `targetUid = NaN`, which converts to `NaN` in SQL parameters. While `better-sqlite3` handles SQL parameters safely without crashing or allowing SQL injection, standardizing explicit checks (`Number.isNaN(...)`) prevents unexpected filtering results.
- **Suggestion**: Add `Number.isNaN(...)` fallbacks when parsing integer query parameters.

#### 2. [Minor] Semicolon splitting in SQL migration runner `migrate.js`
- **What**: `executeSqlSafely` splits SQL scripts by `;` (`sqlContent.split(';')`).
- **Where**: `server/src/migrate.js:67`
- **Why**: If a future migration contains SQL strings or triggers with literal semicolons inside string constants, splitting on `;` could divide statements incorrectly.
- **Suggestion**: Migration scripts currently consist of simple DDL statements (e.g. `ALTER TABLE`, `CREATE INDEX`). For future multi-statement scripts with complex triggers/strings, consider using a proper SQL parser or delimiter markers.

---

## 3. Verified Claims

1. **DB Migration Engine & Schema Upgrades (`server/src/migrate.js`, `server/migrations/002_add_file_hash_and_indexes.sql`)**:
   - Backup creation (`app.db.bak-YYYYMMDD-HHmmss`, max 5 retained) -> Verified via `m1_backend.test.js` and manual execution.
   - WAL checkpoints and `PRAGMA foreign_key_check` execution -> Verified via `migrate.js` code inspection & execution.
   - Row-count tracking & data preservation check (CTO condition #1) -> Verified in `runMigrations(db)`.
   - Index creation (`idx_images_file_hash`, `idx_images_project_status_split`, `idx_annotations_class_image`, `idx_activity_log_proj_created`) -> Verified via SQLite schema inspection.

2. **Slow Request Logger (`server/src/middleware/slowLogger.js`)**:
   - Logs requests exceeding 500ms threshold to `console.warn` and `server.log` -> Verified via middleware inspect & execution.

3. **Images API & Instant Hash Validation (`server/src/routes/images.js`, `server/src/routes/validate.js`)**:
   - `file_hash` computed via MD5 on `/upload` & `/upload-zip` -> Verified in upload routes.
   - Instant SQL duplicate detection (`GROUP BY file_hash HAVING count > 1`) -> Verified in `server/src/routes/validate.js`.
   - Backward compatibility for legacy unpaginated array calls -> Verified via `auth.test.js` (210/210 pass).

4. **Dashboard & Reports REST APIs (`server/src/routes/dashboard.js`, `server/src/app.js`)**:
   - Aggregated KPIs, user productivity, dataset balance, timeline, CSV & JSON report exports -> Verified via `m1_backend.test.js`.

---

## 4. Coverage & Risk Assessment

- **SQL Injection Risks**: ZERO. All database interactions in the reviewed files use parameterized prepared statements (`db.prepare('...').get(...)`, `all(...)`, `run(...)`).
- **Performance Impact**: High positive impact. Indexes significantly speed up annotation lookups, project image filtering, and activity log queries. Fast hash validation avoids disk I/O bottlenecks.
- **Regression Risk**: Low. Existing auth and feature suites pass 100%.

---

## 5. Verification Method

To independently verify all findings and test suite assertions:

```powershell
# 1. Run migration CLI engine
npm run migrate --prefix server

# 2. Run Milestone 1 Integration Tests (46 tests)
node tests/m1_backend.test.js

# 3. Run Full Auth & Regression Test Suite (210 tests)
node tests/auth.test.js
```

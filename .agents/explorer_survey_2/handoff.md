# Phase 0 Survey Handoff Report (Server & Database)

## 1. Observation
- **Working Directory**: `e:\KZTEK\Code_Git\Roboflow - Copy\.agents\explorer_survey_2`
- **Server Entrypoint**: `server/src/index.js` (lines 1-182)
- **Database Module**: `server/src/db.js` (lines 1-620)
- **Database File**: `server/data/app.db` (SQLite 3, WAL mode, foreign keys enabled)
- **Legacy Database**: `db_old/app.db`
- **Existing Migrations in `db.js`**:
  - `m003_add_users` (`db.js:121-168`) — `users` table & default admin seed
  - `m004_add_review_status` (`db.js:170-198`) — review workflow columns on `images`
  - `m005_phase3_schema` (`db.js:200-325`) — `annotation_history`, `activity_log`, `annotations.version`
  - `m006_add_image_done_columns` (`db.js:327-386`) — `completed_at`, `completed_by` on `images`
  - `m007_detect_cache` (`db.js:388-454`) — `detect_cache` table
  - `m008_default_model_id` (`db.js:456-493`) — `default_model_id` on `projects`
  - `m009_model_metadata` (`db.js:495-533`) — `notes`, `map_score`, `version_label` on `models`
  - `m010_work_assignment` (`db.js:535-582`) — `assigned_to` on `images`, `project_assignments` table
- **Unused Migration File**: `server/migrations/001_create_jobs.sql` (lines 1-21) — not loaded by `db.js`.
- **Existing Stats Route**: `server/src/routes/stats.js` (lines 6-46) — `GET /api/projects/:projectId/stats` returning basic counts.
- **Image Query Bottleneck**: `server/src/routes/images.js` (lines 71-75):
  ```javascript
  const images = db.prepare(`
    SELECT i.*,
      (SELECT GROUP_CONCAT(DISTINCT a.class_id) FROM annotations a WHERE a.image_id = i.id) AS class_ids_raw
    FROM images i WHERE i.project_id = ?${assignmentFilter} ORDER BY i.created_at ASC
  `).all(...params);
  ```
  Returns ALL images in a single array without pagination (`limit`/`offset`).
- **Synchronous Disk I/O Bottleneck**: `server/src/routes/validate.js` (lines 34-41, 56-62):
  Calls `fs.readFileSync(filePath)` synchronously inside a loop over all project images to compute MD5 hashes during validation requests.
- **Existing Integration Test**: `tests/auth.test.js` (1412 lines) — vanilla Node script that spawns the Express server on port 4099 and runs integration assertions. No `npm test` script in `server/package.json`.

---

## 2. Logic Chain
1. **Observation**: `ORIGINAL_REQUEST.md` requires R3 (Dashboard & Reports), R4 (Performance & Refactoring), R5 (Database Migration Scripts), and R6 (Verification & Testing with Unit/Integration tests).
2. **Deduction (R3)**: `routes/stats.js` only provides basic image and annotation totals. It does not provide global system statistics, review status breakdowns, user productivity metrics, timeline trends, or CSV export endpoints. Therefore, dedicated dashboard/report routes (`/api/dashboard/overview`, `/api/projects/:projectId/reports/*`) are needed.
3. **Deduction (R4)**: `routes/images.js` fetches all images at once with correlated subqueries per row. `routes/validate.js` executes synchronous file reads for MD5 hashing. These will freeze Node's single-threaded event loop under high load or large datasets. Adding pagination, composite indexing, stream-based/cached hashing, and response time logging middleware is required to eliminate slow warnings.
4. **Deduction (R5)**: Database migrations are currently hardcoded as JS startup functions in `db.js`, ignoring `server/migrations/001_create_jobs.sql`. Creating a formal migration runner (`migrate.js`) with a `schema_migrations` tracking table ensures safe, repeatable migrations and rollback capabilities.
5. **Deduction (R6)**: The project currently lacks unit test files and package test scripts. Adding modular unit tests for DB queries, validation logic, assignment algorithms, and report math, alongside integration tests for dashboard endpoints, will satisfy R6.

---

## 3. Caveats
- **Read-Only Scope**: This survey was performed in read-only mode without modifying codebase files.
- **Database Scale Testing**: Benchmark tests on SQLite behavior were conducted on existing database state (~few dozen images); behavior under 100,000+ images is deduced from SQL query patterns and single-threaded Node event loop mechanics.
- **Python Inference Service**: AI auto-labeling tests depend on Python 3.9+ with `fastapi`, `uvicorn`, and `ultralytics` installed on the host system.

---

## 4. Conclusion
The backend architecture of KZTEK Labeling Studio is functional and secure, but requires:
1. **R3**: 4 new/expanded report API endpoints (`GET /api/dashboard/overview`, `/api/projects/:id/dashboard`, `/api/projects/:id/reports/users`, `/api/projects/:id/reports/export`).
2. **R4**: Server-side pagination (`GET /api/projects/:id/images?page=1&limit=50`), async streaming/cached hash validation, batch image processing, and slow-request warning logging.
3. **R5**: Standalone SQL/JS migration runner (`migrate.js`), `schema_migrations` tracking table, composite indices on `images` and `annotations`, and `images.file_hash` column.
4. **R6**: Structured unit test suite in `tests/unit/` and expanded integration tests in `tests/integration/`, wired into `npm test`.

---

## 5. Verification Method
1. **Inspect Analysis Report**: View `e:\KZTEK\Code_Git\Roboflow - Copy\.agents\explorer_survey_2\analysis.md`.
2. **Verify Existing Server Startup & Tests**:
   - Start server: `cd server && npm run dev`
   - Run integration test: `node tests/auth.test.js`
3. **Verify Database Structure**:
   - Inspect `server/src/db.js` line numbers 121–582 for inline migrations `m003` to `m010`.

---

## 6. Remaining Work
- **Phase 1 Master Plan Integration**: Provide these survey findings to the Tech Lead / Orchestrator for inclusion in `PLAN-MASTER.md`.
- **Phase 2 Implementation**:
  - Implement R5 migration framework (`server/src/migrate.js`).
  - Implement R4 pagination and request duration logger.
  - Implement R3 Dashboard & Reports endpoints.
  - Implement R6 Unit and Integration test runner.

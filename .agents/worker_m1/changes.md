# Summary of Code Changes - Milestone 1 (Worker M1)

## 1. Database Migrations & DB Schema Upgrades (R5)
- **`server/migrations/002_add_file_hash_and_indexes.sql`**: Created SQL migration adding `images.file_hash` column and composite performance indexes (`idx_images_file_hash`, `idx_images_project_status_split`, `idx_annotations_class_image`, `idx_activity_log_proj_created`).
- **`server/src/migrate.js`**: Implemented standalone CLI migration runner with tracking table `schema_migrations`, WAL checkpoints, automatic backup rotation (`app.db.bak-YYYYMMDD-HHmmss`, keeping 5 newest), row-count data loss prevention checks (CTO condition #1), and foreign key integrity verification.
- **`server/package.json`**: Added `"migrate": "node src/migrate.js"` script.
- **`server/src/db.js`**: Imported `runMigrations` and invoked `runMigrations(db)` after baseline schema setup on server startup.

## 2. Server Performance & Slow Request Logger (R4)
- **`server/src/middleware/slowLogger.js`**: Implemented Express middleware to monitor request duration (>500ms threshold by default or `SLOW_REQUEST_THRESHOLD_MS`), outputting warning logs to `console.warn` and appending log entries to `server.log`.
- **`server/src/services/hashService.js`**: Added helper service to handle MD5 file checksums and background hash backfilling.
- **`server/src/routes/images.js`**: Refactored `GET /api/projects/:projectId/images` to support server-side pagination (`page`, `limit`), filtering (`status`, `split`, `classId`, `search`/`q`, `assignedTo`, `completed`), while retaining full backward compatibility for unpaginated calls. Updated `/upload` and `/upload-zip` endpoints to compute and store MD5 `file_hash` upon file upload.
- **`server/src/routes/validate.js`**: Refactored dataset validation endpoint to perform instant SQL duplicate hash detection leveraging cached `images.file_hash`, eliminating blocking synchronous disk I/O.

## 3. Dashboard & Reports Backend REST APIs (R3)
- **`server/src/routes/dashboard.js`**: Implemented high-performance aggregated endpoints:
  - `GET /api/dashboard/overview`: Global system KPIs and recent activity log entries.
  - `GET /api/projects/:projectId/dashboard`: Project-level summary KPIs, review status breakdown, dataset balance, and user productivity metrics.
  - `GET /api/projects/:projectId/reports/users`: User productivity metrics and labeling speed averages.
  - `GET /api/projects/:projectId/reports/timeline`: Daily/weekly activity trends (images added, completed, annotations created).
  - `GET /api/projects/:projectId/reports/export`: CSV and JSON format report export endpoints.
- **`server/src/app.js`**: Created modular Express app declaration mounting all middlewares (including `slowLogger`) and routers (`/api/dashboard`, `/api/projects`, etc.).
- **`server/src/index.js`**: Updated server entry point to import `app` from `./app.js`.

## 4. Testing & Verification
- **`tests/m1_backend.test.js`**: Created new integration test suite covering DB migration runner execution, DB schema/index verification, Dashboard & Reports REST APIs, paginated images API, and slow logger.
- **Verification Commands & Results**:
  - `npm run migrate --prefix server`: 0 pending migrations remaining, FK check passed.
  - `node tests/auth.test.js`: 210/210 passed (0 regressions).
  - `node tests/m1_backend.test.js`: 46/46 passed.

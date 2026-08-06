# Phase 0 Backend & Database Survey Report — Roboflow Upgrade Project

## Executive Summary
This report presents a comprehensive survey of the **Server / Backend codebase** (`server/`) and **Database architecture** (`server/data/app.db` and legacy `db_old/app.db`) for the Roboflow Upgrade Project.

The system is a Node.js Express 4.21 backend utilizing SQLite via `better-sqlite3` in WAL mode, with an integrated Python FastAPI inference service for AI auto-labeling. The codebase contains 27 active routes, 11 database tables, inline startup migrations, and a basic integration test script (`tests/auth.test.js`).

To satisfy requirements **R3, R4, R5, R6** from `ORIGINAL_REQUEST.md`, significant enhancements are required across API endpoints, aggregation queries, pagination, asynchronous I/O, database indexing/migrations, and automated unit/integration testing.

---

## 1. Current Architecture & Codebase Map

### 1.1 Technology Stack
- **Runtime & Server**: Node.js 18+ (ES Modules `"type": "module"`), Express.js `v4.21.0`
- **Database**: SQLite 3 via `better-sqlite3` (`v13.0.2`), `journal_mode = WAL`, `foreign_keys = ON`
- **Auth & Security**: JWT (`jsonwebtoken` `v9.0.3`) via HTTP-only cookies & Bearer tokens, `bcrypt` (`v6.0.0`) password hashing (cost=12), `helmet` (`v8.3.0`), `cors` (`v2.8.5`), role-based access control (`admin`, `reviewer`, `annotator`)
- **File Uploads & Imaging**: `multer` (`v1.4.5-lts.1`), `sharp` (`v0.35.3`), `adm-zip` (`v0.6.0`), `archiver` (`v7.0.1`)
- **AI Inference**: Python FastAPI service (`server/src/python/inference_service.py` running on port 8001 using `ultralytics`), auto-spawned by Express on startup with fallback to spawn-per-request (`infer.py`)

### 1.2 Directory Structure (`server/src/`)
```
server/
├── data/                      # Data directory (app.db, images/, models/, thumbnails/)
├── migrations/                # Legacy migration directory (contains 001_create_jobs.sql)
├── package.json               # Node dependencies and scripts (dev, start)
└── src/
    ├── index.js               # Express app entrypoint, middleware, route mounting, Python process spawn
    ├── db.js                  # Database connection, inline schema definitions (m003..m010), activity logging
    ├── lib/
    │   └── jwt-secret.js      # JWT secret manager
    ├── middleware/
    │   ├── auth.js            # Authentication middleware (authRequired)
    │   └── roles.js           # Role-based access control (requireRole)
    ├── python/
    │   ├── inference_service.py # FastAPI service with LRU model caching
    │   └── infer.py           # Legacy CLI script for single-request inference
    └── routes/                # 18 Modular Express routers
        ├── activity.js        # GET /api/projects/:projectId/activity
        ├── annotations.js     # PUT /api/images/:imageId/annotations (with optimistic locking & history)
        ├── assignments.js     # Work distribution & assignment % management
        ├── auth.js            # POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
        ├── autolabel.js       # POST /api/projects/:projectId/auto-label, detect_cache management
        ├── classes.js         # CRUD classes per project
        ├── export.js          # Export YOLO, COCO, Pascal VOC formats
        ├── history.js         # GET /api/images/:imageId/history, POST revert
        ├── images.js          # GET, POST (upload, upload-zip), PATCH, DELETE images & batch operations
        ├── jobs.js            # GET /api/jobs/:jobId
        ├── models.js          # CRUD models per project, model metadata
        ├── prefill.js         # GET /api/projects/:projectId/prefill
        ├── projects.js        # CRUD projects
        ├── reviews.js         # POST submit-review, approve, reject
        ├── stats.js           # GET /api/projects/:projectId/stats
        ├── thumbnails.js      # GET /api/images/:id/thumb (on-demand sharp resize & caching)
        ├── users.js           # CRUD users, profile update
        └── validate.js        # GET /api/projects/:projectId/validate
```

---

## 2. Requirement Analysis & Gap Assessment

### 2.1 R3. Dashboard & Reports (Backend API & Aggregations)
#### Existing Capabilities
- `GET /api/projects/:projectId/stats` (`routes/stats.js:6-46`): Returns basic image counts (`totalImages`, `labeledImages`, `unlabeledImages`), total annotations count, `bySplit` counts, and `perClass` annotation counts.
- `GET /api/projects/:projectId/activity` (`routes/activity.js:23-47`): Returns activity audit log items.
- `GET /api/projects/:projectId/assignments` (`routes/assignments.js:22-56`): Returns assignment percentage targets and done count per user.
- `GET /api/projects/:projectId/validate` (`routes/validate.js:44-127`): Returns dataset quality metrics (duplicates, invalid annotations, unused classes).

#### Identified Gaps for R3
1. **System-wide Overview Dashboard API (`GET /api/dashboard/overview`)**:
   - Currently, there is NO system-level endpoint. The frontend must iterate all projects to aggregate system stats.
   - Required: Aggregate total projects, total images, total annotations across system, active annotator/reviewer counts, system-wide completion %, and system-wide recent activity timeline.
2. **Comprehensive Project Dashboard API (`GET /api/projects/:projectId/dashboard`)**:
   - Existing stats (`routes/stats.js`) lack breakdown by `review_status` (`draft`, `in_review`, `approved`, `rejected`), `completed_at` (mark-done status), and user progress.
   - Required: Complete image breakdown matrix (`status` × `review_status` × `split`), work completion velocity, and dataset balance statistics (imbalance score, unannotated class warnings).
3. **User Productivity & Annotator Metrics (`GET /api/projects/:projectId/reports/users`)**:
   - Required: Annotations created per user, images marked done per user, images approved/rejected per reviewer, average labeling time, and compliance against assigned quota targets.
4. **Time-series Trend & Activity Reports (`GET /api/projects/:projectId/reports/timeline`)**:
   - Required: Daily/weekly grouping of annotations saved (`annotations.created_at` or `activity_log`), images marked done (`images.completed_at`), and review submissions.
5. **Exportable Summary Reports (`GET /api/projects/:projectId/reports/export`)**:
   - Required: CSV and JSON report generators for project metrics, class balance tables, and user activity summaries.

---

### 2.2 R4. Server Performance Optimization & Refactoring
#### Identified Bottlenecks & Issues

1. **Unpaginated Query in `GET /api/projects/:projectId/images` (`routes/images.js:71-75`)**:
   - **Observation**:
     ```javascript
     const images = db.prepare(`
       SELECT i.*,
         (SELECT GROUP_CONCAT(DISTINCT a.class_id) FROM annotations a WHERE a.image_id = i.id) AS class_ids_raw
       FROM images i WHERE i.project_id = ?${assignmentFilter} ORDER BY i.created_at ASC
     `).all(...params);
     ```
   - **Problem**: Runs a correlated subquery for **every single image** and returns all rows at once without `LIMIT` or `OFFSET`. With 10,000+ images, this causes server response delays, high memory allocation, and client-side rendering freezes.
   - **Fix Required**: Implement server-side pagination (`page`, `limit` or cursor), field projection, filtering (`status`, `split`, `review_status`, `assigned_to`, `class_id`, `search`), and replace correlated subqueries with an efficient `LEFT JOIN` or indexed lookup.

2. **Synchronous Disk I/O Blocking Event Loop in Dataset Validation (`routes/validate.js:56-62`)**:
   - **Observation**: `fs.readFileSync(filePath)` is called synchronously inside `md5File` for every image in the project during `GET /api/projects/:projectId/validate`.
   - **Problem**: Reading hundreds of multi-megabyte images synchronously blocks the Node.js main thread completely, freezing all API requests across all connected clients.
   - **Fix Required**: Use asynchronous streaming/`fs.promises` with concurrency limits (e.g. `p-limit` or worker pool), or store/cache file MD5 hashes in the database upon upload (`images.file_hash`).

3. **Sequential Image Upload Processing (`routes/images.js:107-116`, `154-167`)**:
   - **Observation**: Uploading multiple files or extracting ZIP archives processes image metadata (`await sharp(file.path).metadata()`) one by one in a sequential `for` loop.
   - **Problem**: High latency on large batch uploads.
   - **Fix Required**: Process Sharp metadata calls in bounded parallel batches (e.g. `Promise.all` with chunk size of 5–10).

4. **Lack of Performance Monitoring Middleware & Slow Request Warnings**:
   - **Observation**: Express app has no HTTP request logging middleware (e.g., `morgan` or custom logger) and no response duration tracking (`X-Response-Time` header or console warnings when request duration > 500ms).
   - **Fix Required**: Add a lightweight response-time monitoring middleware to log slow requests (>500ms) with method, URL, status code, and duration.

5. **Missing Database Indices for Common Filter Combinations**:
   - **Observation**: `images` table has separate single-column indices on `project_id`, `review_status`, `completed_at`, `assigned_to`.
   - **Problem**: Composite queries (e.g., `WHERE project_id = ? AND status = ? AND split = ?`) require index intersection or table scans.
   - **Fix Required**: Add composite indices: `idx_images_project_status_split` on `images(project_id, status, split)` and `idx_annotations_class_image` on `annotations(class_id, image_id)`.

---

### 2.3 R5. Database Schema Changes & Migration Scripts
#### Existing Migration Mechanism
- **Current State**: Schema tables and migrations (`m003_add_users`, `m004_add_review_status`, `m005_phase3_schema`, `m006_add_image_done_columns`, `m007_detect_cache`, `m008_default_model_id`, `m009_model_metadata`, `m010_work_assignment`) are inline JS functions in `server/src/db.js` executed directly on server initialization.
- **Legacy Artifact**: `server/migrations/001_create_jobs.sql` exists in the filesystem but is NOT referenced or executed by `db.js`.
- **Deficiency**: Lack of a formal, file-based migration runner with a tracking table (`schema_migrations`), version numbering, rollback (`down`) capability, and dry-run CLI commands.

#### Required DB Schema Additions
1. **`schema_migrations` Table**:
   ```sql
   CREATE TABLE IF NOT EXISTS schema_migrations (
     version TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     applied_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   ```
2. **`images.file_hash` Column**: Add `TEXT` column to cache MD5 file hashes at upload time for fast duplicate validation.
3. **Composite Indices**:
   - `CREATE INDEX IF NOT EXISTS idx_images_project_status_split ON images(project_id, status, split);`
   - `CREATE INDEX IF NOT EXISTS idx_images_project_review ON images(project_id, review_status);`
   - `CREATE INDEX IF NOT EXISTS idx_annotations_class_image ON annotations(class_id, image_id);`
   - `CREATE INDEX IF NOT EXISTS idx_activity_log_proj_created ON activity_log(project_id, created_at DESC);`

4. **Migration Script Framework**:
   - Implement a clean migration runner utility (`server/src/migrate.js`) that reads SQL/JS files from `server/migrations/`, tracks applied versions in `schema_migrations`, executes missing migrations inside transactions, and logs execution details.

---

### 2.4 R6. Server-Side Unit Tests & Integration Tests
#### Existing Test Suite
- **Current File**: `tests/auth.test.js` (1412 lines).
- **Behavior**: A custom vanilla Node script that spawns a full server instance on port 4099 and runs integration HTTP assertions covering auth matrix AD-A5 rows 1–24.
- **Deficiencies**:
  1. `server/package.json` has NO `"test"` script.
  2. No unit test coverage for individual backend functions, utility modules, database queries, migration logic, or statistical math.
  3. Tests rely on spawning a child process rather than using a standard testing framework (such as Vitest, Jest, or Node's native test runner `node:test`).

#### Required Testing Plan for R6
1. **Configure Package Test Scripts**:
   - Add `"test": "node --test tests/**/*.test.js"` or integrate Vitest / Jest in `server/package.json`.
2. **Unit Tests Required**:
   - `tests/unit/db.test.js`: Test DB connection, transaction safety, backup logic, and retention pruning (`pruneAnnotationHistory`).
   - `tests/unit/validation.test.js`: Test coordinate bound checking and hash duplication logic in `validate.js`.
   - `tests/unit/assignments.test.js`: Test largest-remainder distribution algorithm math in `assignments.js`.
   - `tests/unit/autolabel.test.js`: Test `buildClassMapping` and `filterRawBoxesByConf` logic.
   - `tests/unit/stats.test.js`: Test statistical calculations and report aggregations.
3. **Integration Tests Required**:
   - `tests/integration/dashboard.test.js`: Test `/api/dashboard/overview` and project dashboard endpoints.
   - `tests/integration/images_pagination.test.js`: Test pagination, filtering, and sorting parameters on `GET /api/projects/:projectId/images`.
   - `tests/integration/migrations.test.js`: Test schema migration runner up/down logic against a temporary SQLite database.

---

## 3. Comprehensive Feature & Specification Summary

| Domain | Category | Feature / Requirement Description | Target File / Location | Dependencies & Constraints |
|---|---|---|---|---|
| **R3** | New API | `GET /api/dashboard/overview` — System-wide aggregate stats (projects, images, annotations, users, global completion %, activity feed) | `server/src/routes/dashboard.js` (new) | Auth required, admin/reviewer/annotator viewable |
| **R3** | New API | `GET /api/projects/:projectId/dashboard` — Extended project metrics (review status matrix, user breakdown, class balance) | `server/src/routes/stats.js` or `dashboard.js` | Scoped to project |
| **R3** | New API | `GET /api/projects/:projectId/reports/users` — Annotator & reviewer performance metrics | `server/src/routes/reports.js` (new) | Joins `images`, `annotations`, `users` |
| **R3** | New API | `GET /api/projects/:projectId/reports/timeline` — Daily/weekly annotation & done trends | `server/src/routes/reports.js` (new) | Aggregates `created_at` / `completed_at` |
| **R3** | New API | `GET /api/projects/:projectId/reports/export` — Export summary reports in CSV / JSON format | `server/src/routes/reports.js` (new) | Generates downloadable CSV / JSON |
| **R4** | Refactor | Paginated `GET /api/projects/:projectId/images` (`page`, `limit`, `status`, `split`, `review_status`, `assigned_to`, `search`) | `server/src/routes/images.js` | Backward compatible when pagination params omitted |
| **R4** | Refactor | Async/streamed file hashing in `routes/validate.js` to avoid blocking event loop | `server/src/routes/validate.js` | Use async stream or DB cached hash |
| **R4** | Middleware | Slow request logger middleware (>500ms warning with duration header) | `server/src/middleware/logger.js` (new) | Added to `index.js` stack |
| **R4** | Optimization | Batch sharp metadata processing in `upload` and `upload-zip` | `server/src/routes/images.js` | Concurrency limit (e.g. 5 concurrent) |
| **R5** | Migration System | Standardized migration runner (`migrate.js`) with `schema_migrations` tracking table | `server/src/migrate.js` (new) & `server/migrations/` | Run on server start or via CLI |
| **R5** | DB Schema | Add composite indices: `idx_images_project_status_split`, `idx_annotations_class_image`, `idx_activity_log_proj_created` | `server/src/db.js` / migration file | Performance enhancement for queries |
| **R5** | DB Schema | Add `file_hash` column to `images` table | `server/src/db.js` / migration file | Optional text column for MD5 caching |
| **R6** | Unit Testing | Unit tests for DB utilities, validation, assignments, autolabel helpers, and stats math | `tests/unit/*.test.js` | Native Node test runner or Vitest |
| **R6** | Integration Testing | Integration tests for Dashboard, Reports, Paginated Images, and Migrations | `tests/integration/*.test.js` | HTTP assertions against test server |
| **R6** | Package Scripts | Define `"test"` and `"test:unit"` scripts in `server/package.json` | `server/package.json` | Runnable via `npm test` |

---

## 4. Conclusion & Next Steps
The backend codebase is well-structured but requires target optimizations and feature additions before Phase 1 implementation. 

The immediate next steps for implementation teams will be:
1. Establish the formal migration framework and composite database indices (**R5**).
2. Refactor `GET /api/projects/:projectId/images` to support pagination and performance logging (**R4**).
3. Build the Dashboard and Reports API endpoints (**R3**).
4. Implement comprehensive unit and integration test suites (**R6**).

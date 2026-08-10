# Server Performance & Dashboard/Report REST APIs Architecture & Design Guide

> **Agent**: `explorer_m1_2`  
> **Milestone**: Milestone 1 — Subtask 2 (Server Performance & Dashboard/Report REST APIs)  
> **Date**: 2026-08-06  
> **Target Subsystem**: `server/src` (Node.js, Express, better-sqlite3)

---

## 1. Overview & Objectives

This report details the architectural investigation, bottleneck analysis, and step-by-step refactoring design for Milestone 1 Subtask 2 of the Roboflow Upgrade Project.

### Objectives Scope:
1. **Paginated & Filtered Image API (`GET /api/projects/:projectId/images`)**: Add query pagination (`page`, `limit`), filtering (`status`, `split`, `classId`, `search`, `assignedTo`, `completed`), and replace unindexed correlated subqueries with optimized JOINs & composite indexes.
2. **Async Hash Validation & Cached Hashes (`GET /api/projects/:projectId/validate`)**: Eliminate synchronous disk I/O (`fs.readFileSync`) during dataset validation by introducing `images.file_hash`, hashing upon upload, async backfilling for existing images, and instant SQL duplicate aggregation.
3. **Express Slow Request Monitoring Middleware**: Add high-precision request duration tracking to log warnings (>500ms) to both `console.warn` and `DATA_DIR/server.log`.
4. **Dashboard & Report REST APIs (R3 & R4)**: Design and implement high-performance aggregated endpoints (`GET /api/dashboard/overview`, `GET /api/projects/:projectId/dashboard`, `GET /api/projects/:projectId/reports/users`, `GET /api/projects/:projectId/reports/timeline`, and `/reports/export` for CSV/JSON format).

---

## 2. Deep-Dive Codebase Findings & Bottleneck Analysis

### 2.1 Image List API (`server/src/routes/images.js` lines 52–82)
- **Current Behavior**:
  ```javascript
  const images = db.prepare(`
    SELECT i.*,
      (SELECT GROUP_CONCAT(DISTINCT a.class_id) FROM annotations a WHERE a.image_id = i.id) AS class_ids_raw
    FROM images i WHERE i.project_id = ?${assignmentFilter} ORDER BY i.created_at ASC
  `).all(...params);
  ```
- **Bottlenecks Identified**:
  1. **Unbounded Result Set**: Returns 100% of images for a project in a single JSON payload. On datasets with 5,000+ images, this causes massive payload sizes (>5MB), heavy JSON serialization overhead, and slow network transfer.
  2. **Correlated Subquery Per Row**: Executes `SELECT GROUP_CONCAT...` for every single image row in the database, missing composite index optimization.
  3. **Lack of Server Filtering**: Filtering by `status` or `classId` currently requires fetching all images to the client and filtering in React state.

### 2.2 Dataset Validation API (`server/src/routes/validate.js` lines 50–70)
- **Current Behavior**:
  ```javascript
  function md5File(filePath) {
    try {
      const content = fs.readFileSync(filePath);
      return createHash('md5').update(content).digest('hex');
    } catch { return ''; }
  }
  ```
- **Bottlenecks Identified**:
  1. **Blocking Synchronous File I/O**: Reads every single image file synchronously on every `GET /validate` request. For 2,000 images of 2MB each (4GB total data), this blocks the Node.js event loop for 10-30 seconds, completely freezing all concurrent API traffic.
  2. **Schema Deficit**: The `images` table does not currently cache `file_hash`.

### 2.3 Middleware & Observability Gap (`server/src/index.js`)
- **Current Behavior**: Express middleware stack handles Helmet, CORS, body-parser, cookie-parser, and auth, but lacks response timer instrumentation.
- **Requirement Gap**: No slow request detection or logging (>500ms warning threshold) to `server.log`.

### 2.4 Dashboard & Reports API Deficit
- **Current Behavior**: `server/src/routes/stats.js` provides basic class counts and split breakdown, but lacks global multi-project overview, user productivity metrics, timeline trend aggregations, and report export endpoints.

---

## 3. Comprehensive Refactoring Architecture & API Specifications

### 3.1 Paginated & Filtered Images API

#### Target Route: `GET /api/projects/:projectId/images`

#### Query Parameters:
| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | Integer | `1` | Page number (1-indexed) |
| `limit` | Integer | `50` | Items per page (max `200`) |
| `status` | String | optional | Filter by `status` (`unlabeled`, `labeled`, `in_review`, `approved`, `rejected`) |
| `split` | String | optional | Filter by dataset split (`train`, `valid`, `test`) |
| `classId` | String | optional | Filter images having annotations of specific `class_id` |
| `search` / `q` | String | optional | Partial case-insensitive search on `filename` or `original_name` |
| `assignedTo` | Int / String | optional | Filter by assigned user ID (or `me` for current user) |
| `completed` | String | optional | `'true'` -> `completed_at IS NOT NULL`, `'false'` -> `completed_at IS NULL` |

#### Refactored SQL Queries & Logic:
```javascript
router.get('/', (req, res) => {
  const { projectId } = req.params;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const offset = (page - 1) * limit;

  const { status, split, classId, search, q, assignedTo, completed } = req.query;
  const searchQuery = search || q;

  const conditions = ['i.project_id = ?'];
  const params = [projectId];

  // Annotator assignment restriction rule
  if (req.user?.role === 'annotator') {
    const usingAssignment = db.prepare(
      'SELECT 1 FROM project_assignments WHERE project_id = ? AND percent > 0 LIMIT 1'
    ).get(projectId);
    if (usingAssignment) {
      conditions.push('i.assigned_to = ?');
      params.push(req.user.id);
    }
  }

  if (status) {
    conditions.push('i.status = ?');
    params.push(status);
  }

  if (split) {
    conditions.push('i.split = ?');
    params.push(split);
  }

  if (assignedTo) {
    const targetUid = assignedTo === 'me' ? req.user?.id : parseInt(assignedTo, 10);
    conditions.push('i.assigned_to = ?');
    params.push(targetUid);
  }

  if (completed === 'true') {
    conditions.push('i.completed_at IS NOT NULL');
  } else if (completed === 'false') {
    conditions.push('i.completed_at IS NULL');
  }

  if (searchQuery && searchQuery.trim()) {
    conditions.push('(i.filename LIKE ? OR i.original_name LIKE ?)');
    const pattern = `%${searchQuery.trim()}%`;
    params.push(pattern, pattern);
  }

  if (classId) {
    conditions.push('EXISTS (SELECT 1 FROM annotations a WHERE a.image_id = i.id AND a.class_id = ?)');
    params.push(classId);
  }

  const whereClause = conditions.join(' AND ');

  // 1. Total Count Query
  const countRow = db.prepare(`SELECT COUNT(*) AS total FROM images i WHERE ${whereClause}`).get(...params);
  const total = countRow ? countRow.total : 0;
  const totalPages = Math.ceil(total / limit) || 1;

  // 2. Paginated Data Query
  const dataParams = [...params, limit, offset];
  const images = db.prepare(`
    SELECT i.*,
      (SELECT GROUP_CONCAT(DISTINCT a.class_id) FROM annotations a WHERE a.image_id = i.id) AS class_ids_raw
    FROM images i
    WHERE ${whereClause}
    ORDER BY i.created_at ASC
    LIMIT ? OFFSET ?
  `).all(...dataParams);

  const formattedImages = images.map((i) => ({
    ...i,
    class_ids_raw: undefined,
    class_ids: i.class_ids_raw ? i.class_ids_raw.split(',') : [],
    thumbnail_url: `/api/images/${i.id}/thumb`,
  }));

  res.json({
    images: formattedImages,
    total,
    page,
    limit,
    totalPages,
  });
});
```

---

### 3.2 Async Hash Validation & Cached File Hashes

#### 1. Database Schema Upgrade (`server/src/db.js` / Migration `m011_add_image_file_hash`)
Add `file_hash TEXT` to `images` table and index `idx_images_project_hash`:
```javascript
function m011_add_image_file_hash() {
  const imageCols = db.prepare("PRAGMA table_info(images)").all().map((c) => c.name);
  if (!imageCols.includes('file_hash')) {
    db.exec('ALTER TABLE images ADD COLUMN file_hash TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_images_project_hash ON images(project_id, file_hash)');
  }
}
m011_add_image_file_hash();
```

#### 2. Hash Calculation on Upload (`server/src/routes/images.js`)
When handling image uploads (in `/upload` and `/upload-zip`), compute MD5 hash during sharp metadata extraction or file stream read:
```javascript
const fileBuffer = fs.readFileSync(file.path); // or during zip stream
const fileHash = createHash('md5').update(fileBuffer).digest('hex');
insert.run(id, req.params.projectId, file.filename, file.originalname, meta.width || 0, meta.height || 0, uploaderId, fileHash);
```

#### 3. Async Background Hash Backfill (`server/src/services/hashService.js`)
```javascript
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from '../db.js';

export async function backfillMissingHashes(projectId) {
  const unhashed = db.prepare(
    'SELECT id, filename FROM images WHERE project_id = ? AND (file_hash IS NULL OR file_hash = "") LIMIT 50'
  ).all(projectId);

  if (!unhashed.length) return 0;

  const updateStmt = db.prepare('UPDATE images SET file_hash = ? WHERE id = ?');
  let count = 0;

  for (const img of unhashed) {
    const filePath = path.join(UPLOAD_DIR, projectId, img.filename);
    try {
      if (fs.existsSync(filePath)) {
        const hash = createHash('md5');
        const stream = fs.createReadStream(filePath);
        for await (const chunk of stream) {
          hash.update(chunk);
        }
        const digest = hash.digest('hex');
        updateStmt.run(digest, img.id);
        count++;
      }
    } catch (e) {
      console.error(`[hashService] Failed to compute hash for image ${img.id}:`, e.message);
    }
  }
  return count;
}
```

#### 4. Instant SQL Validation Endpoint (`server/src/routes/validate.js`)
```javascript
router.get('/validate', async (req, res) => {
  const { projectId } = req.params;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  // Trigger non-blocking async backfill for any legacy unhashed images
  backfillMissingHashes(projectId).catch((err) => console.error('[validate] Backfill error:', err));

  // 1. Fast SQL Duplicate Hash Detection
  const duplicateGroups = db.prepare(`
    SELECT file_hash, GROUP_CONCAT(id) AS image_ids_str, COUNT(*) AS count
    FROM images
    WHERE project_id = ? AND file_hash IS NOT NULL AND file_hash != ''
    GROUP BY file_hash
    HAVING count > 1
  `).all(projectId);

  const duplicates = duplicateGroups.map((g) => ({
    hash: g.file_hash,
    imageIds: g.image_ids_str.split(','),
  }));

  // 2. Annotation Coordinate Validation (In-memory SQL JOIN)
  const annotations = db.prepare(`
    SELECT a.id, a.image_id, a.x, a.y, a.w, a.h,
           i.width AS img_width, i.height AS img_height
    FROM annotations a
    JOIN images i ON i.id = a.image_id
    WHERE i.project_id = ?
  `).all(projectId);

  const invalidAnnotations = [];
  for (const a of annotations) {
    const reasons = [];
    if (a.w <= 0) reasons.push('w <= 0');
    if (a.h <= 0) reasons.push('h <= 0');
    if (a.x < 0) reasons.push('x < 0');
    if (a.y < 0) reasons.push('y < 0');
    if (a.img_width > 0 && (a.x + a.w) > a.img_width) {
      reasons.push(`x + w (${+(a.x + a.w).toFixed(2)}) > image.width (${a.img_width})`);
    }
    if (a.img_height > 0 && (a.y + a.h) > a.img_height) {
      reasons.push(`y + h (${+(a.y + a.h).toFixed(2)}) > image.height (${a.img_height})`);
    }
    if (reasons.length > 0) {
      invalidAnnotations.push({
        id: a.id,
        imageId: a.image_id,
        reason: reasons.join('; '),
      });
    }
  }

  // 3. Unused Class Detection
  const classes = db.prepare(
    'SELECT id, name FROM classes WHERE project_id = ? ORDER BY sort_order ASC'
  ).all(projectId);

  const usedClassIds = new Set(
    db.prepare(`
      SELECT DISTINCT a.class_id
      FROM annotations a
      JOIN images i ON i.id = a.image_id
      WHERE i.project_id = ?
    `).all(projectId).map((r) => r.class_id)
  );

  const unusedClasses = classes.filter((c) => !usedClassIds.has(c.id));

  res.json({
    duplicates,
    invalidAnnotations,
    unusedClasses,
  });
});
```

---

### 3.3 Express Slow Request Monitoring Middleware

#### Target File: `server/src/middleware/slowLogger.js`
```javascript
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../db.js';

const LOG_FILE = path.join(DATA_DIR, 'server.log');
const SLOW_THRESHOLD_MS = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS || '500', 10);

export function slowRequestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > SLOW_THRESHOLD_MS) {
      const timestamp = new Date().toISOString();
      const method = req.method.padEnd(6, ' ');
      const url = req.originalUrl || req.url;
      const status = res.statusCode;
      const logLine = `[${timestamp}] [WARN] [SLOW_REQUEST] ${method} ${url} ${status} - ${duration}ms\n`;

      console.warn(`\x1b[33m${logLine.trim()}\x1b[0m`);

      fs.appendFile(LOG_FILE, logLine, (err) => {
        if (err) {
          console.error('[slowLogger] Failed to write warning to server.log:', err.message);
        }
      });
    }
  });

  next();
}
```

#### Wire in `server/src/index.js`:
Place `app.use(slowRequestLogger)` immediately after CORS & body-parser middlewares:
```javascript
import { slowRequestLogger } from './middleware/slowLogger.js';

app.use(express.json({ limit: '2mb' }));
app.use(slowRequestLogger);
```

---

### 3.4 Dashboard & Report REST APIs Architecture

#### Route Wiring Structure:
Create `server/src/routes/dashboard.js` and `server/src/routes/reports.js`.

```
/api/dashboard/overview                     -> Global system KPIs & recent activity
/api/projects/:projectId/dashboard          -> Project summary KPIs, review status, split & user metrics
/api/projects/:projectId/reports/users      -> User productivity breakdown & completion rates
/api/projects/:projectId/reports/timeline   -> Daily/weekly activity trends
/api/projects/:projectId/reports/export     -> Export report as CSV or JSON file
```

#### Detailed Endpoint Implementations:

##### 1. `GET /api/dashboard/overview`
```javascript
router.get('/overview', (req, res) => {
  const totalProjects = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
  const totalImages = db.prepare('SELECT COUNT(*) AS n FROM images').get().n;
  const totalAnnotations = db.prepare('SELECT COUNT(*) AS n FROM annotations').get().n;
  const totalUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

  const completedImages = db.prepare(
    'SELECT COUNT(*) AS n FROM images WHERE completed_at IS NOT NULL OR status = "labeled"'
  ).get().n;
  const globalCompletionPercent = totalImages > 0
    ? Math.round((completedImages / totalImages) * 1000) / 10
    : 0;

  const recentActivity = db.prepare(`
    SELECT a.id, a.project_id, a.actor_id, u.display_name AS actor_name, a.action, a.detail, a.created_at
    FROM activity_log a
    LEFT JOIN users u ON u.id = a.actor_id
    ORDER BY a.created_at DESC
    LIMIT 10
  `).all().map((r) => ({
    ...r,
    detail: r.detail ? JSON.parse(r.detail) : null,
  }));

  res.json({
    totalProjects,
    totalImages,
    totalAnnotations,
    totalUsers,
    globalCompletionPercent,
    recentActivity,
  });
});
```

##### 2. `GET /api/projects/:projectId/dashboard`
```javascript
router.get('/:projectId/dashboard', (req, res) => {
  const { projectId } = req.params;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  const totalImages = db.prepare('SELECT COUNT(*) AS n FROM images WHERE project_id = ?').get(projectId).n;
  const labeledImages = db.prepare('SELECT COUNT(*) AS n FROM images WHERE project_id = ? AND status = "labeled"').get(projectId).n;
  const completedImages = db.prepare('SELECT COUNT(*) AS n FROM images WHERE project_id = ? AND completed_at IS NOT NULL').get(projectId).n;
  const unlabeledImages = totalImages - labeledImages;

  const totalAnnotations = db.prepare(`
    SELECT COUNT(*) AS n FROM annotations a
    JOIN images i ON i.id = a.image_id
    WHERE i.project_id = ?
  `).get(projectId).n;

  // Review Status Breakdown
  const reviewRows = db.prepare(`
    SELECT review_status, COUNT(*) AS cnt FROM images WHERE project_id = ? GROUP BY review_status
  `).all(projectId);
  const reviewStatusBreakdown = { draft: 0, in_review: 0, approved: 0, rejected: 0 };
  for (const r of reviewRows) {
    if (reviewStatusBreakdown[r.review_status] !== undefined) {
      reviewStatusBreakdown[r.review_status] = r.cnt;
    }
  }

  // Dataset Balance
  const splitRows = db.prepare(`
    SELECT split, COUNT(*) AS cnt FROM images WHERE project_id = ? GROUP BY split
  `).all(projectId);
  const bySplit = { train: 0, valid: 0, test: 0 };
  for (const s of splitRows) {
    if (bySplit[s.split] !== undefined) bySplit[s.split] = s.cnt;
  }

  const perClass = db.prepare(`
    SELECT c.id AS class_id, c.name, c.color, COUNT(a.id) AS count
    FROM classes c
    LEFT JOIN annotations a ON a.class_id = c.id
    WHERE c.project_id = ?
    GROUP BY c.id
    ORDER BY c.sort_order ASC
  `).all(projectId);

  // User Productivity
  const userProductivity = db.prepare(`
    SELECT u.id AS userId, u.username, u.display_name AS displayName,
      (SELECT COUNT(*) FROM images WHERE project_id = ? AND uploaded_by = u.id) AS imagesUploaded,
      (SELECT COUNT(*) FROM images WHERE project_id = ? AND completed_by = u.id) AS imagesCompleted,
      (SELECT COUNT(a.id) FROM annotations a JOIN images i ON i.id = a.image_id WHERE i.project_id = ? AND i.completed_by = u.id) AS annotationsCreated
    FROM users u
    ORDER BY imagesCompleted DESC
  `).all(projectId, projectId, projectId);

  res.json({
    totalImages,
    labeledImages,
    unlabeledImages,
    completedImages,
    totalAnnotations,
    reviewStatusBreakdown,
    datasetBalance: { bySplit, perClass },
    userProductivity,
  });
});
```

##### 3. `GET /api/projects/:projectId/reports/users`
```javascript
router.get('/users', (req, res) => {
  const { projectId } = req.params;
  const users = db.prepare(`
    SELECT u.id AS userId, u.username, u.display_name AS displayName, u.role,
      (SELECT COUNT(*) FROM images WHERE project_id = ? AND uploaded_by = u.id) AS imagesUploaded,
      (SELECT COUNT(*) FROM images WHERE project_id = ? AND completed_by = u.id) AS imagesCompleted,
      (SELECT COUNT(a.id) FROM annotations a JOIN images i ON i.id = a.image_id WHERE i.project_id = ? AND (i.completed_by = u.id OR i.uploaded_by = u.id)) AS annotationsCount
    FROM users u
  `).all(projectId, projectId, projectId);

  const report = users.map((u) => {
    const speedAvg = u.imagesCompleted > 0
      ? Math.round((u.annotationsCount / u.imagesCompleted) * 10) / 10
      : 0;
    return { ...u, speedAvg };
  });

  res.json(report);
});
```

##### 4. `GET /api/projects/:projectId/reports/timeline`
```javascript
router.get('/timeline', (req, res) => {
  const { projectId } = req.params;
  const days = Math.min(365, Math.max(7, parseInt(req.query.days || '30', 10)));

  const timelineRows = db.prepare(`
    SELECT
      d.date,
      COALESCE(img.imagesAdded, 0) AS imagesAdded,
      COALESCE(img.imagesCompleted, 0) AS imagesCompleted,
      COALESCE(ann.annotationsCount, 0) AS annotationsCount
    FROM (
      SELECT DISTINCT strftime('%Y-%m-%d', created_at) AS date FROM images WHERE project_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
      UNION
      SELECT DISTINCT strftime('%Y-%m-%d', completed_at) AS date FROM images WHERE project_id = ? AND completed_at IS NOT NULL AND completed_at >= datetime('now', '-' || ? || ' days')
    ) d
    LEFT JOIN (
      SELECT strftime('%Y-%m-%d', created_at) AS date,
             COUNT(*) AS imagesAdded,
             SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS imagesCompleted
      FROM images
      WHERE project_id = ?
      GROUP BY date
    ) img ON img.date = d.date
    LEFT JOIN (
      SELECT strftime('%Y-%m-%d', a.created_at) AS date,
             COUNT(*) AS annotationsCount
      FROM annotations a
      JOIN images i ON i.id = a.image_id
      WHERE i.project_id = ?
      GROUP BY date
    ) ann ON ann.date = d.date
    ORDER BY d.date ASC
  `).all(projectId, days, projectId, days, projectId, projectId);

  res.json(timelineRows);
});
```

##### 5. `GET /api/projects/:projectId/reports/export?format=csv|json`
```javascript
router.get('/export', (req, res) => {
  const { projectId } = req.params;
  const format = (req.query.format || 'csv').toLowerCase();

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  // Fetch metrics data
  const usersReport = db.prepare(`
    SELECT u.id AS userId, u.username, u.display_name AS displayName, u.role,
      (SELECT COUNT(*) FROM images WHERE project_id = ? AND uploaded_by = u.id) AS imagesUploaded,
      (SELECT COUNT(*) FROM images WHERE project_id = ? AND completed_by = u.id) AS imagesCompleted,
      (SELECT COUNT(a.id) FROM annotations a JOIN images i ON i.id = a.image_id WHERE i.project_id = ? AND (i.completed_by = u.id OR i.uploaded_by = u.id)) AS annotationsCount
    FROM users u
  `).all(projectId, projectId, projectId);

  const timelineReport = db.prepare(`
    SELECT strftime('%Y-%m-%d', created_at) AS date,
           COUNT(*) AS imagesAdded,
           SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS imagesCompleted
    FROM images
    WHERE project_id = ?
    GROUP BY date
    ORDER BY date ASC
  `).all(projectId);

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="report_${projectId}_${Date.now()}.json"`);
    return res.json({
      project: { id: project.id, name: project.name },
      exportedAt: new Date().toISOString(),
      userProductivity: usersReport,
      timeline: timelineReport,
    });
  }

  // Build CSV Format
  const csvLines = [
    `# Project Report: ${project.name} (${project.id})`,
    `# Exported At: ${new Date().toISOString()}`,
    '',
    '[User Productivity Report]',
    'User ID,Username,Display Name,Role,Images Uploaded,Images Completed,Annotations Count',
    ...usersReport.map((u) =>
      `"${u.userId}","${u.username}","${u.displayName}","${u.role}",${u.imagesUploaded},${u.imagesCompleted},${u.annotationsCount}`
    ),
    '',
    '[Timeline Summary Report]',
    'Date,Images Added,Images Completed',
    ...timelineReport.map((t) => `"${t.date}",${t.imagesAdded},${t.imagesCompleted}`),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="report_${projectId}_${Date.now()}.csv"`);
  res.send(csvLines.join('\n'));
});
```

---

## 4. Indexing & Database Optimization Summary

To ensure sub-50ms execution times across all endpoints even on 50,000+ row datasets, the following SQL composite indexes must be defined in `server/src/db.js`:

```sql
CREATE INDEX IF NOT EXISTS idx_images_project_status_split ON images(project_id, status, split);
CREATE INDEX IF NOT EXISTS idx_images_project_hash ON images(project_id, file_hash);
CREATE INDEX IF NOT EXISTS idx_images_completed_at ON images(completed_at);
CREATE INDEX IF NOT EXISTS idx_images_uploaded_by ON images(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_annotations_image_class ON annotations(image_id, class_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_created ON activity_log(project_id, created_at DESC);
```

---

## 5. Step-by-Step Implementation Guide for Implementers

1. **Step 1: Add Migration & Indexes in `server/src/db.js`**
   - Add `file_hash` column to `images` table if not present (`m011_add_image_file_hash`).
   - Create composite indexes (`idx_images_project_status_split`, `idx_images_project_hash`, etc.).

2. **Step 2: Implement Slow Request Monitoring Middleware**
   - Create `server/src/middleware/slowLogger.js` to log warnings (>500ms) to console and `server.log`.
   - Wire `app.use(slowRequestLogger)` in `server/src/index.js`.

3. **Step 3: Refactor Image List API in `server/src/routes/images.js`**
   - Implement `page` and `limit` query handling, `total` counting query, and dynamic filtering (`status`, `split`, `classId`, `search`, `assignedTo`, `completed`).
   - Update hash calculation on file upload endpoints (`/upload` and `/upload-zip`).

4. **Step 4: Create Hash Service & Refactor Dataset Validation API in `server/src/routes/validate.js`**
   - Implement `server/src/services/hashService.js` for async backfill.
   - Refactor `GET /validate` to use instant SQL hash aggregation on `file_hash`.

5. **Step 5: Create Dashboard & Reports Routers**
   - Create `server/src/routes/dashboard.js` (`/overview` and `/:projectId/dashboard`).
   - Create `server/src/routes/reports.js` (`/users`, `/timeline`, and `/export`).
   - Mount routers in `server/src/index.js`.

6. **Step 6: Self-Verification & Automated Testing**
   - Run API tests using curl/Vitest.
   - Verify zero slow warnings (>500ms) in `server.log`.

---

## 6. Verification Method

- **Command**: `node --test` or `npm test` inside `server/` (or via Vitest suite once implemented).
- **Manual Verification Commands**:
  ```bash
  # Test paginated images API
  curl -b cookie.txt "http://localhost:4000/api/projects/PROJECT_ID/images?page=1&limit=10&status=labeled"

  # Test dataset validation API (fast SQL response)
  curl -b cookie.txt "http://localhost:4000/api/projects/PROJECT_ID/validate"

  # Test dashboard overview
  curl -b cookie.txt "http://localhost:4000/api/dashboard/overview"

  # Test reports CSV export
  curl -b cookie.txt "http://localhost:4000/api/projects/PROJECT_ID/reports/export?format=csv" -o report.csv
  ```
- **Log Verification**: Inspect `server/data/server.log` to confirm no requests exceed 500ms.

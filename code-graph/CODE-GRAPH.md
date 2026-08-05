# CODE-GRAPH — KZTEK Labeling Studio

> Tài liệu bản đồ codebase. Mọi coding agent PHẢI đọc file này TRƯỚC khi mở source.
> Cập nhật ngay sau mỗi PR merge có thay đổi cấu trúc/API/schema.
>
> Last verified: 2026-08-04 | Cập nhật: junior-developer (STEP-1.3)

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Cấu trúc thư mục](#2-cấu-trúc-thư-mục)
3. [Module map — Server](#3-module-map--server)
4. [Module map — Client](#4-module-map--client)
5. [Module map — Python Inference](#5-module-map--python-inference)
6. [DB Schema thực tế](#6-db-schema-thực-tế)
7. [API Endpoints](#7-api-endpoints)
8. [Dependency graph](#8-dependency-graph)
9. [Điểm sẽ bị ảnh hưởng bởi plan cải tiến](#9-điểm-sẽ-bị-ảnh-hưởng-bởi-plan-cải-tiến)
10. [Lịch sử cập nhật](#10-lịch-sử-cập-nhật)

---

## 1. Tổng quan kiến trúc

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (React 18 + Vite + TypeScript)                      │
│  client/src/                                                 │
│  ├─ App.tsx          React Router — 3 route                  │
│  ├─ api.ts           Fetch wrapper cho toàn bộ API calls     │
│  └─ pages/ + components/                                     │
└───────────────────┬──────────────────────────────────────────┘
                    │ HTTP/REST  (port 4000)
┌───────────────────▼──────────────────────────────────────────┐
│  Node.js/Express (ESM)  — server/src/index.js                │
│  ├─ routes/projects.js     CRUD projects                     │
│  ├─ routes/classes.js      CRUD classes                      │
│  ├─ routes/images.js       Upload/CRUD images                │
│  ├─ routes/annotations.js  Save annotations (replace-all)    │
│  ├─ routes/export.js       Export YOLO/COCO/VOC              │
│  ├─ routes/stats.js        Thống kê project                  │
│  ├─ routes/models.js       Upload/CRUD model .pt             │
│  └─ routes/autolabel.js    Khởi chạy / poll job auto-label   │
│                             (HTTP → FastAPI; legacy: spawn)   │
│                                                              │
│  db.js  — better-sqlite3, WAL, foreign_keys ON              │
│           server/data/app.db  (5 bảng)                       │
│                                                              │
│  [STEP-1.1] index.js spawn inference_service.py khi start,  │
│  kill khi SIGINT/SIGTERM/exit                                │
└──────────┬────────────────────────┬─────────────────────────┘
           │ SQL                    │ HTTP 127.0.0.1:8001
           │                ┌───────▼──────────────────────────┐
           │                │  Python FastAPI (STEP-1.1 MỚI)   │
           │                │  server/src/python/              │
           │                │  inference_service.py            │
           │                │  ├─ GET  /health                 │
           │                │  ├─ POST /warmup                 │
           │                │  └─ POST /predict                │
           │                │  LRU cache: tối đa 3 model/RAM   │
           │                └──────────────────────────────────┘
           │                        (USE_LEGACY_INFER=1 → dùng)
           │                ┌───────▼──────────────────────────┐
           │                │  Python legacy — infer.py         │
           │                │  stdin/stdout JSON, spawn/req     │
           │                │  GIỮ NGUYÊN để rollback           │
           │                └──────────────────────────────────┘
┌──────────▼──────────────────────────────────────────────────┐
│  SQLite  server/data/app.db  (5 bảng)                       │
└─────────────────────────────────────────────────────────────┘

File tĩnh:  server/data/images/<projectId>/<nanoid>.<ext>
            server/data/models/<projectId>/<nanoid>.pt
            server/data/thumbnails/{imageId}_{size}.jpg  ← STEP-1.3 MỚI
Served qua: GET /uploads/* (express.static) + client SPA dist
            GET /api/images/:id/thumb  ← thumbnail service (on-demand, lazy cache)
```

**Port:** 4000 (server + serve SPA dist + /uploads)
**Inference port:** 8001 (env `INFERENCE_PORT`, mặc định 8001)
**DB file:** `server/data/app.db` (tạo tự động nếu chưa có)
**Python bin:** env `PYTHON_BIN` hoặc `python` (mặc định)
**Rollback:** env `USE_LEGACY_INFER=1` → dùng `infer.py` spawn-per-request

---

## 2. Cấu trúc thư mục

```
Roboflow - Copy/
├── server/
│   ├── src/
│   │   ├── index.js                ← Entry point Express
│   │   ├── db.js                   ← DB init, schema, migrations
│   │   ├── routes/
│   │   │   ├── projects.js
│   │   │   ├── classes.js
│   │   │   ├── images.js           ← multer, sharp, adm-zip; GET / trả thêm thumbnail_url
│   │   │   ├── thumbnails.js       ← thumbnail cache service (STEP-1.3 MỚI)
│   │   │   ├── annotations.js
│   │   │   ├── export.js           ← archiver (yolo/coco/voc)
│   │   │   ├── stats.js
│   │   │   ├── models.js
│   │   │   ├── autolabel.js        ← HTTP → FastAPI (STEP-1.1); DB-backed jobs (STEP-1.2)
│   │   │   └── jobs.js             ← CRUD /api/jobs (STEP-1.2 MỚI)
│   │   └── python/
│   │       ├── inference_service.py  ← FastAPI thường trực, LRU cache 3 model (STEP-1.1 MỚI)
│   │       └── infer.py              ← stdin→stdout JSON batch inference (GIỮ LẠI, rollback)
│   ├── migrations/                 ← SQL migration files (chỉ tham khảo; db.js inline là nguồn sự thật)
│   │   └── 001_create_jobs.sql     ← (STEP-1.2)
│   ├── data/                       ← RUNTIME (git-ignored)
│   │   ├── app.db
│   │   ├── images/<projectId>/
│   │   ├── thumbnails/             ← cache thumbnail (STEP-1.3 MỚI): {imageId}_{size}.jpg
│   │   └── models/<projectId>/
│   └── package.json
├── client/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                 ← React Router setup
│   │   ├── api.ts                  ← Tất cả fetch call
│   │   ├── types.ts                ← TS interfaces
│   │   ├── styles.css
│   │   ├── pages/
│   │   │   ├── ProjectsPage.tsx    ← List/create/delete projects
│   │   │   ├── ProjectDetailPage.tsx ← Image grid, upload, filters
│   │   │   └── AnnotatorPage.tsx   ← Canvas editor (bbox+quad), autosave
│   │   ├── components/
│   │   │   ├── Logo.tsx
│   │   │   ├── StatsPanel.tsx
│   │   │   ├── ExportModal.tsx
│   │   │   └── AutoLabelModal.tsx
│   │   └── utils/
│   │       └── files.ts
│   └── package.json
├── code-graph/
│   ├── CODE-GRAPH.md               ← file này
│   └── CODE-GRAPH.pdf
└── docs/plans/                     ← Plan files
```

---

## 3. Module map — Server

### 3.1 `server/src/index.js` — Entry point

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Loại | Express app entry | CONFIRMED |
| Port | `process.env.PORT \|\| 4000` | CONFIRMED |
| Middleware | cors(), express.json(limit 10mb), express.static(/uploads) | CONFIRMED |
| SPA fallback | serve `client/dist/index.html` cho mọi non-API route | CONFIRMED |
| Callers/Used-by | (entry point — không ai import) | CONFIRMED |
| Imports | db.js (UPLOAD_DIR), tất cả 8 route files, node:child_process (spawn) | CONFIRMED |
| **[STEP-1.1]** Inference lifecycle | `startInferenceService()` → spawn `inference_service.py` sau `app.listen()`. `stopInferenceService()` đăng ký qua `process.on('exit'/'SIGINT'/'SIGTERM')` | CONFIRMED |
| **[STEP-1.2]** Jobs router | import + mount `routes/jobs.js` tại `/api/jobs` | CONFIRMED |
| **[STEP-1.3]** Thumbnails router | import + mount `routes/thumbnails.js` tại `/api/images` | CONFIRMED |
| Env vars đọc | `PORT`, `PYTHON_BIN`, `INFERENCE_PORT`, `USE_LEGACY_INFER` | CONFIRMED |
| Last verified | 2026-08-04 (STEP-1.3) | - |

**Route mounting:**
```
/api/projects                         → routes/projects.js
/api/projects/:projectId/classes      → routes/classes.js
/api/projects/:projectId/images       → routes/images.js
/api/images/:imageId/annotations      → routes/annotations.js
/api/projects/:projectId/export       → routes/export.js
/api/projects/:projectId/stats        → routes/stats.js
/api/projects/:projectId/models       → routes/models.js
/api/projects/:projectId/auto-label   → routes/autolabel.js
/api/jobs                             → routes/jobs.js        [STEP-1.2 MỚI]
/api/images                           → routes/thumbnails.js  [STEP-1.3 MỚI]
```

---

### 3.2 `server/src/db.js` — Database layer

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Loại | Singleton DB module (ESM export) | CONFIRMED |
| Exports | `db` (Database instance), `DATA_DIR`, `UPLOAD_DIR`, `MODEL_DIR` | CONFIRMED |
| Callers/Used-by | index.js (UPLOAD_DIR), projects.js, classes.js, images.js, annotations.js, export.js, stats.js, models.js, autolabel.js, jobs.js | CONFIRMED |
| DB engine | better-sqlite3, WAL mode, foreign_keys=ON | CONFIRMED |
| Schema init | `CREATE TABLE IF NOT EXISTS` — idempotent | CONFIRMED |
| Migrations inline | `PRAGMA table_info` + `ALTER TABLE` cho cột thiếu | CONFIRMED |
| **[STEP-1.2]** Startup cleanup | `UPDATE jobs SET status='error' WHERE status IN ('running','pending')` — mọi job dở dang khi restart đều bị đánh dấu error | CONFIRMED |
| Last verified | 2026-08-04 (STEP-1.2) | - |

**Inline migrations hiện có (chạy khi server khởi động):**
1. `annotations.type` — nếu chưa có → ADD COLUMN type TEXT DEFAULT 'bbox'
2. `annotations.points` — nếu chưa có → ADD COLUMN points TEXT
3. `classes.hotkey` — nếu chưa có → ADD COLUMN hotkey TEXT
4. **[STEP-1.2]** Cleanup jobs — UPDATE running/pending → error (startup idempotent)

---

### 3.3 `server/src/routes/projects.js`

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Router options | Router() (không mergeParams) | CONFIRMED |
| Imports | db | CONFIRMED |
| Callers/Used-by | index.js (mounted /api/projects) | CONFIRMED |
| Last verified | 2026-08-04 | - |

| Method | Path | File:Line | Mô tả |
|---|---|---|---|
| GET | `/` | projects.js:9 | List all projects (JOIN count images/labeled/classes) |
| POST | `/` | projects.js:20 | Create project (auto-create 2 default classes) |
| GET | `/:id` | projects.js:33 | Get project by id |
| PATCH | `/:id` | projects.js:39 | Update name/description |
| DELETE | `/:id` | projects.js:48 | Delete project (CASCADE images/classes/annotations) |

---

### 3.4 `server/src/routes/classes.js`

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Router options | Router({ mergeParams: true }) | CONFIRMED |
| Imports | db | CONFIRMED |
| Callers/Used-by | index.js (mounted /api/projects/:projectId/classes) | CONFIRMED |
| Last verified | 2026-08-04 | - |

| Method | Path | File:Line | Mô tả |
|---|---|---|---|
| GET | `/` | classes.js:13 | List classes of project (ORDER BY sort_order) |
| POST | `/` | classes.js:19 | Create class (auto sort_order) |
| PATCH | `/:classId` | classes.js:30 | Update name/color/hotkey |
| DELETE | `/:classId` | classes.js:45 | Delete class (CASCADE annotations) |

**Lưu ý:** `hotkey` bị truncate còn 1 ký tự (`normalizeHotkey` function:L7).

---

### 3.5 `server/src/routes/images.js`

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Router options | Router({ mergeParams: true }) | CONFIRMED |
| Imports | db, UPLOAD_DIR, multer, sharp, adm-zip, nanoid | CONFIRMED |
| Callers/Used-by | index.js (mounted /api/projects/:projectId/images) | CONFIRMED |
| Max file size | 100MB / ảnh, 2GB / zip, 20000 ảnh / upload | CONFIRMED |
| Định dạng | JPG, PNG, WEBP, BMP | CONFIRMED |
| Last verified | 2026-08-04 | - |

| Method | Path | File:Line | Mô tả |
|---|---|---|---|
| GET | `/` | images.js:51 | List images (kèm class_ids array + **thumbnail_url** — STEP-1.3) |
| GET | `/:imageId` | images.js:64 | Get single image + annotations |
| POST | `/upload` | images.js:73 | Upload nhiều file ảnh (multer.array) |
| POST | `/upload-zip` | images.js:95 | Upload ZIP chứa ảnh |
| PATCH | `/:imageId` | images.js:143 | Update split/status |
| DELETE | `/:imageId` | images.js:153 | Delete image + xóa file vật lý |

---

### 3.6 `server/src/routes/annotations.js`

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Router options | Router({ mergeParams: true }) | CONFIRMED |
| Imports | db, nanoid | CONFIRMED |
| Callers/Used-by | index.js (mounted /api/images/:imageId/annotations) | CONFIRMED |
| Pattern | Replace-all: DELETE + bulk INSERT trong transaction | CONFIRMED |
| Last verified | 2026-08-04 | - |

| Method | Path | File:Line | Mô tả |
|---|---|---|---|
| PUT | `/` | annotations.js:12 | Replace toàn bộ annotations của 1 ảnh; auto-update images.status |

**Quan trọng:** Không có GET riêng — annotations được trả cùng `GET /images/:imageId` (images.js:64).

---

### 3.7 `server/src/routes/export.js`

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Router options | Router({ mergeParams: true }) | CONFIRMED |
| Imports | db, UPLOAD_DIR, archiver | CONFIRMED |
| Callers/Used-by | index.js (mounted /api/projects/:projectId/export) | CONFIRMED |
| Last verified | 2026-08-04 | - |

| Method | Path | File:Line | Mô tả |
|---|---|---|---|
| GET | `/split-preview` | export.js:85 | Preview phân chia train/valid/test trước export |
| GET | `/` | export.js:114 | Export ZIP (format=yolo\|coco\|voc, splitMode=manual\|auto) |

**Hỗ trợ:** YOLO (bbox + OBB quad), COCO JSON, Pascal VOC XML. Stratified split logic (rarest class first).

---

### 3.8 `server/src/routes/stats.js`

| Method | Path | File:Line | Mô tả |
|---|---|---|---|
| GET | `/` | stats.js:6 | Tổng số ảnh, labeled, bySplit, perClass annotation count |

---

### 3.9 `server/src/routes/models.js`

| Method | Path | File:Line | Mô tả |
|---|---|---|---|
| GET | `/` | models.js:26 | List models của project |
| POST | `/upload` | models.js:32 | Upload file .pt (max 1GB) |
| DELETE | `/:modelId` | models.js:43 | Delete model + xóa file .pt |

---

### 3.10 `server/src/routes/autolabel.js`

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Router options | Router({ mergeParams: true }) | CONFIRMED |
| Imports | db, UPLOAD_DIR, MODEL_DIR, child_process.spawn, readline, node:path, nanoid | CONFIRMED |
| **[STEP-1.2] Job storage** | **DB-backed**: `createJobInDB()` khi POST; `syncJobToDB()` khi hoàn thành; `getJobFromDB()` khi GET fall-back. In-memory Map chỉ dùng trong quá trình inference đang chạy. | CONFIRMED |
| **[STEP-1.1] Inference mode mặc định** | HTTP fetch → `http://127.0.0.1:{INFERENCE_PORT}/predict` (FastAPI service thường trực) | CONFIRMED |
| **[STEP-1.1] Rollback mode** | `USE_LEGACY_INFER=1` → dùng spawn infer.py stdin/stdout cũ (giữ nguyên để rollback) | CONFIRMED |
| Health gate | Trước mỗi job, gọi `GET /health` (timeout 3s); trả 503 nếu service chưa sẵn sàng | CONFIRMED |
| Batch size | 32 ảnh/request tới FastAPI; timeout 5 phút/batch | CONFIRMED |
| Env vars đọc | `INFERENCE_PORT` (default 8001), `USE_LEGACY_INFER` | CONFIRMED |
| Last verified | 2026-08-04 (STEP-1.2) | - |

| Method | Path | File:Line | Mô tả |
|---|---|---|---|
| POST | `/` | autolabel.js:~290 | Khởi chạy job inference; tạo row DB ngay; returns `{jobId, total}` 202 |
| GET | `/:jobId` | autolabel.js:~350 | Poll trạng thái: memory Map → fall-back DB |

**Cơ chế mới (STEP-1.1):** `checkInferenceHealth()` → `fetch(INFERENCE_URL/predict, batch)` → parse response `{classes, results, errors}` → `saveDetectionsForImage()` → cập nhật job.
**Cơ chế persist (STEP-1.2):** `createJobInDB()` khi POST; HTTP mode `.then()/.catch()` → `syncJobToDB()` → `jobs.delete()`. Legacy mode: `setInterval(500ms)` poll job.status → sync khi done/error.
**Legacy (USE_LEGACY_INFER=1):** `spawn(PYTHON_BIN, [INFER_SCRIPT])` → stdin JSON → readline stdout — giữ nguyên, không xóa.
**Depth-1 callers:** index.js (mount `/api/projects/:pid/auto-label`) — không thay đổi mount path.

---

### 3.12 `server/src/routes/thumbnails.js` — Thumbnail cache service (STEP-1.3 MỚI)

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Router options | Router() (không mergeParams) | CONFIRMED |
| Imports | db, UPLOAD_DIR, DATA_DIR, path, fs, sharp | CONFIRMED |
| Callers/Used-by | index.js (mounted /api/images) | CONFIRMED |
| Cache dir | `DATA_DIR/thumbnails/` — tạo sẵn khi module load | CONFIRMED |
| Naming cache file | `{imageId}_{size}.jpg` | CONFIRMED |
| Size range | min 32, max 600, default 300 | CONFIRMED |
| Fallback | resize lỗi → serve ảnh gốc (không trả 500) | CONFIRMED |
| Last verified | 2026-08-04 (STEP-1.3) | - |

| Method | Path | Mô tả |
|---|---|---|
| GET | `/:id/thumb` | Lazy thumbnail: cache hit → serve; ảnh gốc nhỏ hơn size → serve gốc; else resize+cache+serve |

**Query params:** `?size=300` (default 300, min 32, max 600)
**Cache-Control:** `public, max-age=86400` (1 ngày)
**Exports:** `THUMB_DIR` (dùng để test/cleanup)

---

### 3.11 `server/src/routes/jobs.js` — Job history CRUD (STEP-1.2 MỚI)

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Router options | Router() | CONFIRMED |
| Imports | db | CONFIRMED |
| Callers/Used-by | index.js (mounted /api/jobs) | CONFIRMED |
| Last verified | 2026-08-04 (STEP-1.2) | - |

| Method | Path | File:Line | Mô tả |
|---|---|---|---|
| GET | `/` | jobs.js:~22 | List jobs by projectId (query param `?projectId=`) — ORDER BY created_at DESC |
| GET | `/:id` | jobs.js:~31 | Get single job by id |
| DELETE | `/:id` | jobs.js:~37 | Delete job record |

**Response shape (`normalizeJob`):** `{id, projectId, status, total, done, created, failed, modelId, error, unmatchedClasses[], createdAt, updatedAt}`

### 3.13 `server/src/routes/reviews.js` — Review workflow (STEP-2.3 MỚI)

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Router options | Router({ mergeParams: true }) | CONFIRMED |
| Imports | db, requireRole (middleware/roles.js) | CONFIRMED |
| Callers/Used-by | index.js (mounted `/api/images/:imageId`) | CONFIRMED |
| Last verified | 2026-08-04 (STEP-2.3) | - |

| Method | Path | Role required | Mô tả |
|---|---|---|---|
| POST | `/submit-review` | annotator, admin | draft\|rejected → in_review |
| POST | `/approve` | reviewer, admin | in_review → approved |
| POST | `/reject` | reviewer, admin | in_review → rejected (body: `{comment}`) |

Lifecycle: `draft → in_review → approved` hoặc `→ rejected → (submit lại) → in_review`. Conflict trạng thái sai → 409 `REVIEW_STATUS_CONFLICT`.

---

## 4. Module map — Client

### 4.1 `client/src/App.tsx` — Router root

| Route | Component | Mô tả |
|---|---|---|
| `/` | ProjectsPage | Danh sách projects |
| `/projects/:projectId` | ProjectDetailPage | Chi tiết project, image grid |
| `/projects/:projectId/annotate/:imageId` | AnnotatorPage | Canvas annotator |

---

### 4.2 `client/src/api.ts` — API client

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Pattern | Thin fetch wrapper (`request<T>`) — không có state | CONFIRMED |
| Callers/Used-by | ProjectsPage, ProjectDetailPage, AnnotatorPage | CONFIRMED |
| Auth | Không có (no token/cookie) | CONFIRMED |
| Last verified | 2026-08-04 | - |

**Hàm public:**
```
listProjects, createProject, getProject, deleteProject
listClasses, createClass, updateClass, deleteClass
listImages, getImage, uploadImages, uploadZip, updateImage, deleteImage
saveAnnotations
exportUrl, getSplitPreview
getStats
listModels, uploadModel, deleteModel
startAutoLabel, getAutoLabelJob
```

---

### 4.3 `client/src/types.ts` — TypeScript types

Các interface chính:
- `Project` — id, name, description, created_at, image_count, labeled_count, class_count
- `ClassLabel` — id, project_id, name, color, sort_order, hotkey
- `ImageItem` — id, project_id, filename, original_name, width, height, split, status, created_at, class_ids[], **thumbnail_url?** (STEP-1.3)
- `Annotation` — id, image_id, class_id, x, y, w, h, type, points
- `ImageWithAnnotations` — ImageItem + annotations[]
- `ModelInfo` — id, project_id, filename, original_name, created_at
- `AutoLabelJob` — status, total, done, created, failed, error, unmatchedClasses[]

---

### 4.4 `client/src/pages/AnnotatorPage.tsx` — Canvas editor

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Callers/Used-by | App.tsx (route /projects/:pid/annotate/:iid) | CONFIRMED |
| API calls | api.listClasses, api.listImages, api.getImage, api.saveAnnotations | CONFIRMED |
| Autosave | debounce 600ms sau mỗi thay đổi box | CONFIRMED |
| Tools | bbox (draw rect), quad (4-point OBB) | CONFIRMED |
| Hotkeys | Arrow ← → navigate, Delete xóa box | INFERRED |
| State: boxes | Box[] (local) — sync lên server khi dirty | CONFIRMED |
| State: undo | KHÔNG có undo/redo hiện tại | CONFIRMED |
| Last verified | 2026-08-04 | - |

---

### 4.5 `client/src/pages/ProjectDetailPage.tsx` — Image grid

| API calls | listClasses, listImages, uploadImages, uploadZip, updateImage, deleteImage |
|---|---|
| Features | Filter by status/split/class/search, pagination (page×pageSize), drag-drop upload |
| Modals | StatsPanel, ExportModal, AutoLabelModal |

---

### 4.6 Components

| Component | Callers | Mô tả |
|---|---|---|
| `Logo.tsx` | App.tsx | KZTEK logo SVG inline |
| `StatsPanel.tsx` | ProjectDetailPage | Chart/bảng stats project |
| `ExportModal.tsx` | ProjectDetailPage | UI chọn format/split, trigger export |
| `AutoLabelModal.tsx` | ProjectDetailPage | Chọn model, confidence, scope; poll job progress |

---

## 5. Module map — Python Inference

### 5.1 `server/src/python/infer.py` — Legacy (GIỮ LẠI để rollback)

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Protocol | stdin: JSON payload → stdout: streaming NDJSON (1 line/ảnh) + `{"done":true}` | CONFIRMED |
| Caller | autolabel.js `runInference()` (khi `USE_LEGACY_INFER=1`) | CONFIRMED |
| Dependencies | ultralytics (import lazy bên trong main()) | CONFIRMED |
| Model load | `YOLO(model_path)` — load từ disk mỗi lần spawn | CONFIRMED |
| Output bbox | `{class_index, type:"bbox", x, y, w, h}` (pixel coords) | CONFIRMED |
| Output quad | `{class_index, type:"quad", points:[{x,y}×4]}` (OBB) | CONFIRMED |
| Error handling | Per-image try/except → `{image_id, error, classes}` | CONFIRMED |
| Status | GIỮ NGUYÊN — rollback bằng `USE_LEGACY_INFER=1` | CONFIRMED |
| Last verified | 2026-08-04 | - |

**Input format (stdin):**
```json
{
  "model_path": "/abs/path/model.pt",
  "conf": 0.25,
  "images": [{"id": "nanoid", "path": "/abs/path/img.jpg"}, ...]
}
```

---

### 5.2 `server/src/python/inference_service.py` — FastAPI thường trực (STEP-1.1 MỚI)

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Framework | FastAPI + uvicorn | CONFIRMED |
| Port | `127.0.0.1:{INFERENCE_PORT}` (default 8001) | CONFIRMED |
| LRU cache | `LRUModelCache(max_size=3)` — tối đa 3 model giữ trong RAM | CONFIRMED |
| Caller | index.js `startInferenceService()` — spawn khi Node start | CONFIRMED |
| Dependencies | fastapi, uvicorn, ultralytics (lazy import bên trong `_load_model`) | CONFIRMED |
| Lifecycle | index.js spawn/kill; không auto-restart khi crash (STEP log `Service stopped`) | CONFIRMED |
| Env vars | `INFERENCE_PORT` | CONFIRMED |
| Last verified | 2026-08-04 (STEP-1.1) | - |

**Endpoints:**

| Method | Path | Mô tả |
|---|---|---|
| GET | `/health` | Trả `{status, loaded_models[], uptime_s}` |
| POST | `/warmup` | Preload model vào LRU cache. Body: `{model_path}` |
| POST | `/predict` | Batch inference. Body: `{model_path, conf, iou, images:[{id,path}]}` |

**Response `/predict`:**
```json
{
  "classes": ["class_name_0", ...],
  "results": [{"image_id": "nanoid", "detections": [{"class_index":0,"type":"bbox","x":...,"y":...,"w":...,"h":...}]}],
  "errors": [{"image_id": "nanoid", "error": "message"}]
}
```

**Output bbox:** `{class_index, type:"bbox", x, y, w, h}` — tương thích với infer.py cũ
**Output quad (OBB):** `{class_index, type:"quad", points:[{x,y}×4]}`
**Error handling:** Per-image try/except → gộp vào `errors[]` (không crash toàn batch)

---

## 6. DB Schema thực tế

> Nguồn: `server/src/db.js` — đọc trực tiếp CREATE TABLE statements. Confidence: CONFIRMED toàn bộ.

### Bảng `projects`

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| name | TEXT | NOT NULL |
| description | TEXT | DEFAULT '' |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |

### Bảng `classes`

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| project_id | TEXT | NOT NULL, FK→projects(id) ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| color | TEXT | NOT NULL |
| sort_order | INTEGER | NOT NULL DEFAULT 0 |
| hotkey | TEXT | nullable (migration nếu chưa có) |

**Index:** `idx_classes_project ON classes(project_id)`

### Bảng `images`

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| project_id | TEXT | NOT NULL, FK→projects(id) ON DELETE CASCADE |
| filename | TEXT | NOT NULL (tên file trên disk, nanoid+ext) |
| original_name | TEXT | NOT NULL (tên gốc khi upload) |
| width | INTEGER | NOT NULL |
| height | INTEGER | NOT NULL |
| split | TEXT | NOT NULL DEFAULT 'train' (train/valid/test) |
| status | TEXT | NOT NULL DEFAULT 'unlabeled' (unlabeled/labeled) |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |
| review_status | TEXT | NOT NULL DEFAULT 'draft' — STEP-2.3 MỚI (draft→in_review→approved\|rejected) |
| review_comment | TEXT | nullable — STEP-2.3 MỚI (lý do reject) |
| reviewed_by | INTEGER | FK→users(id), nullable — STEP-2.3 MỚI |
| reviewed_at | TEXT | nullable — STEP-2.3 MỚI |

**Index:** `idx_images_project ON images(project_id)`, `idx_images_review_status ON images(review_status)` (STEP-2.3 MỚI)

**⚠️ Lưu ý cho STEP-3.5:** `submit-review` hiện cho phép bất kỳ ảnh draft/rejected nào (không check `completed_at`). Khi STEP-3.5 thêm `completed_at`/`completed_by`, sửa `reviews.js` để check `completed_at IS NOT NULL` trước khi cho submit-review.

### Bảng `annotations`

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| image_id | TEXT | NOT NULL, FK→images(id) ON DELETE CASCADE |
| class_id | TEXT | NOT NULL, FK→classes(id) ON DELETE CASCADE |
| x | REAL | NOT NULL (pixel, top-left) |
| y | REAL | NOT NULL (pixel, top-left) |
| w | REAL | NOT NULL (pixel width) |
| h | REAL | NOT NULL (pixel height) |
| type | TEXT | NOT NULL DEFAULT 'bbox' (bbox/quad) — migration nếu chưa có |
| points | TEXT | nullable, JSON string [[{x,y}×4]] cho type=quad — migration nếu chưa có |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |

**Index:** `idx_annotations_image ON annotations(image_id)`

### Bảng `models`

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| project_id | TEXT | NOT NULL, FK→projects(id) ON DELETE CASCADE |
| filename | TEXT | NOT NULL (tên file .pt trên disk) |
| original_name | TEXT | NOT NULL (tên gốc khi upload) |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |

**Index:** `idx_models_project ON models(project_id)`

### Bảng `jobs` — STEP-1.2 MỚI

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| project_id | TEXT | NOT NULL (no FK — không CASCADE khi xóa project, job history giữ lại) |
| status | TEXT | NOT NULL DEFAULT 'pending' (pending/running/done/error) |
| total_images | INTEGER | NOT NULL DEFAULT 0 |
| processed | INTEGER | NOT NULL DEFAULT 0 (ảnh đã xử lý xong) |
| created_annotations | INTEGER | NOT NULL DEFAULT 0 |
| failed | INTEGER | NOT NULL DEFAULT 0 |
| model_id | TEXT | nullable |
| error_msg | TEXT | nullable |
| unmatched_classes | TEXT | NOT NULL DEFAULT '[]' (JSON array tên class không map được) |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') |
| updated_at | TEXT | NOT NULL DEFAULT datetime('now') |

**Indexes:** `idx_jobs_project ON jobs(project_id)`, `idx_jobs_status ON jobs(status)`
**Startup behavior:** Khi server khởi động, mọi row có `status IN ('running','pending')` → cập nhật thành `'error'` với `error_msg='Server restarted while job was in progress'`.

---

## 7. API Endpoints

> Tất cả CONFIRMED từ source (index.js route mounting + từng route file).

### Projects

| Method | Path | File:Line | Response |
|---|---|---|---|
| GET | /api/projects | projects.js:9 | Project[] (kèm counts) |
| POST | /api/projects | projects.js:20 | Project (201) |
| GET | /api/projects/:id | projects.js:33 | Project |
| PATCH | /api/projects/:id | projects.js:39 | Project |
| DELETE | /api/projects/:id | projects.js:48 | 204 |

### Classes

| Method | Path | File:Line | Response |
|---|---|---|---|
| GET | /api/projects/:pid/classes | classes.js:13 | ClassLabel[] |
| POST | /api/projects/:pid/classes | classes.js:19 | ClassLabel (201) |
| PATCH | /api/projects/:pid/classes/:cid | classes.js:30 | ClassLabel |
| DELETE | /api/projects/:pid/classes/:cid | classes.js:45 | 204 |

### Images

| Method | Path | File:Line | Response |
|---|---|---|---|
| GET | /api/projects/:pid/images | images.js:51 | ImageItem[] |
| GET | /api/projects/:pid/images/:iid | images.js:64 | ImageWithAnnotations |
| POST | /api/projects/:pid/images/upload | images.js:73 | ImageItem[] (201) |
| POST | /api/projects/:pid/images/upload-zip | images.js:95 | {created, skipped} (201) |
| PATCH | /api/projects/:pid/images/:iid | images.js:143 | ImageItem |
| DELETE | /api/projects/:pid/images/:iid | images.js:153 | 204 |

### Annotations

| Method | Path | File:Line | Response |
|---|---|---|---|
| PUT | /api/images/:iid/annotations | annotations.js:12 | Annotation[] |

### Export

| Method | Path | File:Line | Response |
|---|---|---|---|
| GET | /api/projects/:pid/export/split-preview | export.js:85 | SplitPreview JSON |
| GET | /api/projects/:pid/export | export.js:114 | ZIP stream (attachment) |

Query params export: `format=yolo\|coco\|voc`, `splitMode=manual\|auto`, `trainRatio=0.8`

### Stats

| Method | Path | File:Line | Response |
|---|---|---|---|
| GET | /api/projects/:pid/stats | stats.js:6 | ProjectStats JSON |

### Models

| Method | Path | File:Line | Response |
|---|---|---|---|
| GET | /api/projects/:pid/models | models.js:26 | ModelInfo[] |
| POST | /api/projects/:pid/models/upload | models.js:32 | ModelInfo (201) |
| DELETE | /api/projects/:pid/models/:mid | models.js:43 | 204 |

### Auto-label

| Method | Path | File:Line | Response |
|---|---|---|---|
| POST | /api/projects/:pid/auto-label | autolabel.js:~290 | {jobId, total} (202) |
| GET | /api/projects/:pid/auto-label/:jid | autolabel.js:~350 | AutoLabelJob (memory → DB fallback) |

### Jobs (STEP-1.2 MỚI)

| Method | Path | File:Line | Response |
|---|---|---|---|
| GET | /api/jobs?projectId=:pid | jobs.js:~22 | JobRecord[] |
| GET | /api/jobs/:id | jobs.js:~31 | JobRecord |
| DELETE | /api/jobs/:id | jobs.js:~37 | {ok:true} |

### Thumbnails (STEP-1.3 MỚI)

| Method | Path | File:Line | Response |
|---|---|---|---|
| GET | /api/images/:id/thumb | thumbnails.js:29 | JPEG binary (thumbnail or original) — 200; 404 nếu image/file không tồn tại |

**Query params:** `?size=300` (default 300px, min 32, max 600)
**Cache-Control:** `public, max-age=86400`

---

## 8. Dependency graph

### Server dependencies (package.json — CONFIRMED)

| Package | Version | Dùng ở |
|---|---|---|
| express | ^4.21.0 | index.js, tất cả routes |
| better-sqlite3 | ^9.6.0 | db.js |
| cors | ^2.8.5 | index.js |
| multer | ^1.4.5-lts.1 | images.js, models.js |
| sharp | ^0.32.6 | images.js (metadata width/height, resize) |
| adm-zip | ^0.6.0 | images.js (unzip upload) |
| archiver | ^7.0.1 | export.js (tạo zip export) |
| nanoid | ^5.0.7 | projects, classes, images, annotations, models, autolabel |

### Client dependencies (package.json — CONFIRMED)

| Package | Version | Dùng ở |
|---|---|---|
| react | ^18.3.1 | tất cả components/pages |
| react-dom | ^18.3.1 | main.tsx |
| react-router-dom | ^6.26.2 | App.tsx, các pages |
| vite | ^5.4.6 | dev/build tool |
| typescript | ^5.6.2 | type checking |

### Python dependencies

| Package | Dùng ở | Confidence |
|---|---|---|
| ultralytics | infer.py, inference_service.py (YOLO model, predict — lazy import) | CONFIRMED |
| fastapi | inference_service.py (FastAPI app, endpoints, Pydantic schemas) | CONFIRMED |
| uvicorn | inference_service.py (ASGI server, entrypoint) | CONFIRMED |

---

## 9. Điểm sẽ bị ảnh hưởng bởi plan cải tiến

> Mục này là "blast radius map" cho 23 bước trong PLAN-MASTER.md.
> Confidence: CONFIRMED từ phân tích source + plan.

### Phase 1.1 — Inference service FastAPI (thường trực) — ✅ HOÀN THÀNH

**Files đã thay đổi (STEP-1.1):**
- `server/src/routes/autolabel.js` — Refactor: thêm `runInferenceHTTP()` gọi FastAPI, giữ `runInference()` cũ cho rollback (USE_LEGACY_INFER=1). Health gate trước mỗi job → 503 khi service down.
- `server/src/index.js` — Thêm `startInferenceService()` / `stopInferenceService()` lifecycle.
- `server/src/python/inference_service.py` — FastAPI app mới, LRU cache 3 model.
- `server/src/python/infer.py` — GIỮ NGUYÊN (rollback).
- `server/README.md` — Thêm mục "Chạy inference service", env vars, cấu trúc Python inference.

**Depth-1 callers:** index.js (mount autolabelRouter) — không đổi mount path.
**Watch out:** client/api.ts `startAutoLabel` + `getAutoLabelJob` không đổi (same REST interface).

---

### Phase 1.2 — Persist bảng `jobs` — ✅ HOÀN THÀNH

**Files đã thay đổi (STEP-1.2):**
- `server/src/db.js` — thêm `CREATE TABLE IF NOT EXISTS jobs (...)` + 2 indexes + startup cleanup (UPDATE running/pending → error)
- `server/src/routes/autolabel.js` — thêm `createJobInDB`, `syncJobToDB`, `getJobFromDB`; POST handler tạo DB row + sync khi hoàn thành; GET handler fall-back DB
- `server/src/routes/jobs.js` — **MỚI**: GET/GET/:id/DELETE /api/jobs
- `server/src/index.js` — import + mount jobsRouter tại `/api/jobs`
- `server/migrations/001_create_jobs.sql` — **MỚI**: migration SQL (tham khảo)

**Depth-1 callers:** client/src/api.ts (`getAutoLabelJob`) — REST interface giữ nguyên, không cần sửa client.
**Watch out:** `jobs` table không có FK tới `projects` — khi xóa project, jobs không bị cascade. Thiết kế có chủ ý (giữ job history). Phase sau nếu cần cleanup → DELETE FROM jobs WHERE project_id=? trong routes/projects.js khi DELETE project.

---

### Phase 1.3 — Thumbnail service — ✅ HOÀN THÀNH

**Files đã thay đổi (STEP-1.3):**
- `server/src/routes/thumbnails.js` — **MỚI**: lazy thumbnail endpoint `GET /api/images/:id/thumb`, cache `DATA_DIR/thumbnails/{id}_{size}.jpg`
- `server/src/index.js` — import + mount thumbnailsRouter tại `/api/images`
- `server/src/routes/images.js` — GET `/` thêm field `thumbnail_url` vào response
- `client/src/types.ts` — thêm `thumbnail_url?: string` vào `ImageItem`
- `client/src/pages/ProjectDetailPage.tsx` — image grid dùng `img.thumbnail_url` thay `/uploads/…`

**Depth-1 callers:**
- `client/src/pages/ProjectDetailPage.tsx` → dùng `img.thumbnail_url` (thêm)
- `client/src/pages/AnnotatorPage.tsx` → không thay đổi (dùng `getImage` riêng, không qua list)

**Watch out:** `THUMB_DIR` tạo khi module load — nếu `DATA_DIR` không ghi được sẽ crash lúc server start. Cần đảm bảo `server/data/` có write permission.

---

### Phase 2.2 — Auth implementation — ✅ HOÀN THÀNH

**Files bị ảnh hưởng:**
- `server/src/db.js` — bảng `users` (INTEGER AUTOINCREMENT id, username, password_hash, display_name, role, color, created_at, is_active)
- `server/src/index.js` — mount `auth.js`/`users.js`, middleware auth
- Tạo mới: `server/src/routes/auth.js`, `server/src/routes/users.js`, `server/src/middleware/`, `server/src/lib/`
- `client/src/api.ts`, `client/src/types.ts`, `client/src/App.tsx`, `client/src/pages/LoginPage.tsx`
- Test: `tests/auth.test.js` — 87 passed theo ma trận AD-A5 (2 điều kiện CTO #A1/#A2 đạt)

### Phase 2.3 — Review workflow — ✅ HOÀN THÀNH

**Files bị ảnh hưởng:**
- `server/src/db.js` — `m004_add_review_status()`: 4 cột mới trên `images` (`review_status`, `review_comment`, `reviewed_by`, `reviewed_at`) + index
- Tạo mới: `server/src/routes/reviews.js` (xem §3.13)
- `server/src/index.js` — mount `reviewsRouter` tại `/api/images/:imageId`
- Test: `tests/auth.test.js` Row 8 — 8 test case pass (submit-review, approve, reject, comment, role guard, 401)

**Watch out cho STEP-3.5:** `submit-review` hiện không check `completed_at` (field đó chưa tồn tại) — khi STEP-3.5 xong, cập nhật điều kiện submit trong `reviews.js`.

---

### Phase 3.1 — DB Migration (ĐỤNG SCHEMA HIỆN CÓ)

**Files bị ảnh hưởng:**
- `server/src/db.js` — ALTER TABLE `annotations` ADD COLUMN `version INTEGER DEFAULT 0`; CREATE TABLE `annotation_history`; CREATE TABLE `activity_log`
- `server/src/routes/annotations.js` — UPDATE `version` khi save, INSERT vào `annotation_history`

**Depth-1 callers sẽ break nếu migration sai:** tất cả code đọc/ghi bảng `annotations` (annotations.js, images.js:64, export.js, stats.js, autolabel.js).

**Watch out:** Bảng `annotation_history` và `activity_log` cần `actor_id FK→users.id` — Phase 2 (bảng `users`) PHẢI hoàn thành trước.

---

### Phase 3.5 — Image done status

**Files bị ảnh hưởng:**
- `server/src/db.js` — ALTER TABLE `images` ADD COLUMN `completed_at DATETIME`, ADD COLUMN `completed_by INTEGER REFERENCES users(id)`
- `server/src/routes/images.js` — PATCH endpoint thêm xử lý `completed_at`/`completed_by`
- `client/src/types.ts` — thêm `completed_at`, `completed_by` vào `ImageItem`
- `client/src/pages/AnnotatorPage.tsx` — thêm nút/phím tắt "confirm done"

---

### Phase 4.1 — Detect cache

**Files bị ảnh hưởng:**
- `server/src/db.js` hoặc file migration riêng — CREATE TABLE `detect_cache`
- `server/src/routes/autolabel.js` — check cache trước khi gọi inference service

---

### Phase 5.1 — Undo/Redo

**Files bị ảnh hưởng:**
- `client/src/pages/AnnotatorPage.tsx` — thêm undoStack/redoStack state, Ctrl+Z/Ctrl+Y handler

---

### Phase 6.1 — Model versioning

**Files bị ảnh hưởng:**
- `server/src/db.js` — ALTER TABLE `models` ADD COLUMN `metadata JSON`
- `server/src/routes/models.js` — thêm PATCH endpoint, GET endpoint với metadata
- `client/src/types.ts` — mở rộng `ModelInfo`

---

## 10. Lịch sử cập nhật

| Ngày | Người cập nhật | Nội dung | Commit |
|---|---|---|---|
| 2026-08-04 | senior-developer (STEP-0.1) | Tạo mới — full audit 5 bảng, 8 routes, API endpoints, blast radius map | (STEP-0.1) |
| 2026-08-04 | senior-developer (STEP-1.1) | Cập nhật §3.10 autolabel.js (HTTP mode + legacy rollback), thêm §5.2 inference_service.py, cập nhật §8 Python deps, §9 Phase 1.1 DONE | (STEP-1.1) |
| 2026-08-04 | senior-developer (STEP-1.2) | Thêm §3.11 jobs.js (MỚI), cập nhật §2 (migrations/ + jobs.js), §3.1 (route /api/jobs), §3.2 (startup cleanup), §3.10 (DB-backed job storage), §6 (jobs table schema), §7 (/api/jobs endpoints), §9 Phase 1.2 DONE | (STEP-1.2) |
| 2026-08-04 | junior-developer (STEP-1.3) | Thêm §3.12 thumbnails.js (MỚI), cập nhật §1 (data/thumbnails/), §2 (thư mục + route), §3.1 (mount /api/images), §3.5 (thumbnail_url field), §4.3 (ImageItem.thumbnail_url), §7 (/api/images/:id/thumb), §9 Phase 1.3 DONE | (STEP-1.3) |
| 2026-08-04 | tech-lead+cto+em (STEP-2.1) | Auth ADR riêng (`ADR-auth-labeling-studio.md`), security-audit-stride, CTO+EM APPROVED kèm điều kiện #A1/#A2 | (STEP-2.1) |
| 2026-08-04 | senior-developer (STEP-2.2) | Bảng `users` (INTEGER id, role, color), routes auth.js/users.js, middleware, LoginPage — 87 test pass ma trận AD-A5, npm audit sạch (điều kiện #A1/#A2 đạt), §9 Phase 2.2 DONE | (STEP-2.2) |
| 2026-08-04 | senior-developer (STEP-2.3) | Thêm §3.13 reviews.js (MỚI), cập nhật §6 bảng `images` (4 cột review), §9 Phase 2.3 DONE — review workflow submit/approve/reject, Row 8 test pass | (STEP-2.3) |

# CODE-GRAPH — KZTEK Labeling Studio

> Tài liệu bản đồ codebase. Mọi coding agent PHẢI đọc file này TRƯỚC khi mở source.
> Cập nhật ngay sau mỗi PR merge có thay đổi cấu trúc/API/schema.
>
> Last verified: 2026-08-04 | Người tạo: senior-developer (STEP-0.1)

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
│                                                              │
│  db.js  — better-sqlite3, WAL, foreign_keys ON              │
│           server/data/app.db  (5 bảng)                       │
└───────────────────┬──────────────────────────────────────────┘
                    │ child_process.spawn (stdin/stdout JSON)
┌───────────────────▼──────────────────────────────────────────┐
│  Python — server/src/python/infer.py                         │
│  Load model YOLO → batch predict → stream kết quả JSON       │
│  Phụ thuộc: ultralytics                                      │
└──────────────────────────────────────────────────────────────┘

File tĩnh:  server/data/images/<projectId>/<nanoid>.<ext>
            server/data/models/<projectId>/<nanoid>.pt
Served qua: GET /uploads/* (express.static) + client SPA dist
```

**Port:** 4000 (server + serve SPA dist + /uploads)
**DB file:** `server/data/app.db` (tạo tự động nếu chưa có)
**Python bin:** env `PYTHON_BIN` hoặc `python` (mặc định)

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
│   │   │   ├── images.js           ← multer, sharp, adm-zip
│   │   │   ├── annotations.js
│   │   │   ├── export.js           ← archiver (yolo/coco/voc)
│   │   │   ├── stats.js
│   │   │   ├── models.js
│   │   │   └── autolabel.js        ← spawn Python, in-memory jobs Map
│   │   └── python/
│   │       └── infer.py            ← stdin→stdout JSON batch inference
│   ├── data/                       ← RUNTIME (git-ignored)
│   │   ├── app.db
│   │   ├── images/<projectId>/
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
| Imports | db.js (UPLOAD_DIR), tất cả 8 route files | CONFIRMED |
| Last verified | 2026-08-04 | - |

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
```

---

### 3.2 `server/src/db.js` — Database layer

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Loại | Singleton DB module (ESM export) | CONFIRMED |
| Exports | `db` (Database instance), `DATA_DIR`, `UPLOAD_DIR`, `MODEL_DIR` | CONFIRMED |
| Callers/Used-by | index.js (UPLOAD_DIR), projects.js, classes.js, images.js, annotations.js, export.js, stats.js, models.js, autolabel.js | CONFIRMED |
| DB engine | better-sqlite3, WAL mode, foreign_keys=ON | CONFIRMED |
| Schema init | `CREATE TABLE IF NOT EXISTS` — idempotent | CONFIRMED |
| Migrations inline | `PRAGMA table_info` + `ALTER TABLE` cho cột thiếu | CONFIRMED |
| Last verified | 2026-08-04 | - |

**Inline migrations hiện có (chạy khi server khởi động):**
1. `annotations.type` — nếu chưa có → ADD COLUMN type TEXT DEFAULT 'bbox'
2. `annotations.points` — nếu chưa có → ADD COLUMN points TEXT
3. `classes.hotkey` — nếu chưa có → ADD COLUMN hotkey TEXT

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
| GET | `/` | images.js:51 | List images (kèm class_ids array) |
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
| Imports | db, UPLOAD_DIR, MODEL_DIR, child_process.spawn, readline, nanoid | CONFIRMED |
| Job storage | **In-memory Map** (mất khi restart server) | CONFIRMED |
| Python protocol | stdin JSON → stdout streaming JSON (1 line/ảnh) | CONFIRMED |
| Last verified | 2026-08-04 | - |

| Method | Path | File:Line | Mô tả |
|---|---|---|---|
| POST | `/` | autolabel.js:73 | Khởi chạy job inference (returns jobId) |
| GET | `/:jobId` | autolabel.js:151 | Poll trạng thái job |

**Cơ chế:** `spawn(PYTHON_BIN, [INFER_SCRIPT])` → ghi toàn bộ job payload qua stdin → đọc stdout từng dòng qua readline → cập nhật job object trong Map.
**Điểm yếu:** jobs mất khi server restart; model YOLO load lại từ disk mỗi lần gọi (không cache trong RAM).

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
- `ImageItem` — id, project_id, filename, original_name, width, height, split, status, created_at, class_ids[]
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

### `server/src/python/infer.py`

| Thuộc tính | Giá trị | Confidence |
|---|---|---|
| Protocol | stdin: JSON payload → stdout: streaming NDJSON (1 line/ảnh) + `{"done":true}` | CONFIRMED |
| Caller | autolabel.js (via child_process.spawn) | CONFIRMED |
| Dependencies | ultralytics (import lazy bên trong main()) | CONFIRMED |
| Model load | `YOLO(model_path)` — load từ disk mỗi lần spawn | CONFIRMED |
| Output bbox | `{class_index, type:"bbox", x, y, w, h}` (pixel coords) | CONFIRMED |
| Output quad | `{class_index, type:"quad", points:[{x,y}×4]}` (OBB) | CONFIRMED |
| Error handling | Per-image try/except → `{image_id, error, classes}` | CONFIRMED |
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

**Index:** `idx_images_project ON images(project_id)`

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
| POST | /api/projects/:pid/auto-label | autolabel.js:73 | {jobId, total} (202) |
| GET | /api/projects/:pid/auto-label/:jid | autolabel.js:151 | AutoLabelJob |

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

### Python dependencies (INFERRED từ import trong infer.py)

| Package | Dùng ở |
|---|---|
| ultralytics | infer.py (YOLO model, predict) |

---

## 9. Điểm sẽ bị ảnh hưởng bởi plan cải tiến

> Mục này là "blast radius map" cho 23 bước trong PLAN-MASTER.md.
> Confidence: CONFIRMED từ phân tích source + plan.

### Phase 1.1 — Inference service FastAPI (thường trực)

**Files bị ảnh hưởng:**
- `server/src/routes/autolabel.js` — MAJOR REWRITE: thay `spawn(PYTHON_BIN, [...])` bằng `fetch('http://localhost:8001/predict')`. Xóa bỏ readline/stdin/stdout protocol.
- `server/src/python/infer.py` — GIỮ NGUYÊN (backup/rollback). Tạo thêm `server/src/python/inference_service.py` (FastAPI app mới).

**Depth-1 callers:** index.js (mount autolabelRouter) — không đổi mount path.
**Watch out:** client/api.ts `startAutoLabel` + `getAutoLabelJob` không đổi (same REST interface).

---

### Phase 1.2 — Persist bảng `jobs`

**Files bị ảnh hưởng:**
- `server/src/db.js` — thêm `CREATE TABLE IF NOT EXISTS jobs (...)` + migration
- `server/src/routes/autolabel.js` — thay `const jobs = new Map()` bằng DB reads/writes
- Tạo mới: `server/src/routes/jobs.js` (nếu cần endpoint riêng cho job history)

---

### Phase 2.2 — Auth implementation

**Files bị ảnh hưởng:**
- `server/src/db.js` — thêm `CREATE TABLE IF NOT EXISTS users (...)` + `sessions` table
- `server/src/index.js` — mount authRouter, thêm auth middleware global (hoặc per-router)
- Tạo mới: `server/src/routes/auth.js`, `server/src/middleware/auth.js`
- `client/src/api.ts` — thêm `login`, `logout`, `getMe`; gắn Authorization header vào `request()`
- `client/src/types.ts` — thêm `User` interface
- `client/src/App.tsx` — thêm route `/login`, guard AuthRoute

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
| 2026-08-04 | senior-developer (STEP-0.1) | Tạo mới — full audit 5 bảng, 8 routes, API endpoints, blast radius map | TBD |

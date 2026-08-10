---
task: labeling-studio-improve
created: 2026-08-04
updated: 2026-08-05 05:08
status: completed
workflow: WF-FEATURE (đa phase)
priority: P1
---

# PLAN MASTER: KZTEK Labeling Studio — Cải tiến toàn diện

> File này CHỈ chứa tổng quan + trạng thái. Chi tiết từng bước (mô tả đầy đủ, Handoff Log, artifact chi tiết) nằm ở `steps/STEP-[N.M]-[tên].md` tương ứng — xem cột "Step file" bên dưới.

## Mô tả

Cải tiến toàn diện KZTEK Labeling Studio (Node.js/Express + SQLite + React 18/Vite/TS) — bản viết lại server thay thế tool desktop Tkinter cũ. Ba nhóm mục tiêu: (1) tối ưu thời gian xử lý label, (2) lịch sử/audit rõ ràng với actor_id từ đầu, (3) tính năng nâng cao. SAM polygon đã bị loại khỏi scope.

Stack hiện tại: `server/src/` (Express, better-sqlite3, raw SQL), `client/src/` (React 18, Vite, TS), `server/src/python/infer.py` (spawn process mỗi lần gọi), 5 bảng DB: `projects, classes, images, annotations, models`.

## Nguồn yêu cầu

- Yêu cầu gốc: cải tiến toàn bộ 3 nhóm (tối ưu label + lịch sử + nâng cao), P1, không deadline cứng
- Repo: `e:\KZTEK\Code_Git\Roboflow - Copy`, nhánh `Improve`, remote: `https://github.com/flick-git-anhnv/Roboflow.git`
- Workflow: WF-FEATURE (mỗi feature), WF-ARCH (Phase 2 auth design)
- Agent chain mẫu WF-FEATURE: PM → BA → UX → EM → [CTO*] → PJM → TL → SD/JD → TL review → [UXR nếu có UI] → QA → DevOps

> **CẢNH BÁO RỦI RO KIẾN TRÚC:**
> - **Phase 2 (toàn bộ)** — AUTH: thêm user/auth/role. BẮT BUỘC CTO/EM approve + `security-audit-stride` trước merge từng bước.
> - **Phase 3 (3.1)** — ĐỤNG SCHEMA HIỆN CÓ: thêm cột vào bảng `annotations` + tạo bảng mới với `actor_id` FK → `users`. BẮT BUỘC CTO/EM approve + `security-audit-stride` trước merge.

> **Lý do Auth (Phase 2) chạy TRƯỚC DB History (Phase 3):** bảng `annotation_history`, `activity_log` cần cột `actor_id` FK → `users.id`; bảng `images` cần cột `completed_by` FK → `users.id`. Bảng `users` phải tồn tại trước — tránh migrate schema 2 lần.

---

## Phases & Steps

> **Session isolation (CLAUDE.md §16.5):** Mỗi bước ⬜/🔄 PHẢI chạy tách session — LOCAL dùng `Agent` subagent, WEB dùng `RemoteTrigger`. Agent/trigger tự tạo/cập nhật step file riêng, commit+push, rồi cập nhật đúng 1 dòng status ở bảng dưới đây.

---

### Phase 0: Phân tích & Thiết kế kiến trúc

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 0.1 | Codebase audit + tạo CODE-GRAPH | senior-developer | ✅ | `steps/STEP-0.1-codebase-audit-code-graph.md` | 2026-08-04 11:38 |
| 0.2 | Technical Design Document tổng thể + ADR (schema migration, auth design, inference service) | tech-lead → cto | ✅ | `steps/STEP-0.2-technical-design-architecture.md` | 2026-08-04 11:47 |

---

### Phase 1: Hạ tầng nền tảng

> Không đụng schema hiện có, không auth. Có thể chạy song song với quá trình review ADR auth.

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 1.1 | Inference service Python thường trực (FastAPI, giữ model trong RAM, Node gọi HTTP) | senior-developer | ✅ | `steps/STEP-1.1-inference-service-fastapi.md` | 2026-08-04 16:42 |
| 1.2 | Persist bảng `jobs` cho auto-label (thay in-memory) | senior-developer | ✅ | `steps/STEP-1.2-jobs-table-persist.md` | 2026-08-04 16:53 |
| 1.3 | Thumbnail service (resize ảnh lớn, lưu cache, phục vụ grid/filmstrip) | junior-developer | ✅ | `steps/STEP-1.3-thumbnail-service.md` | 2026-08-04 17:04 |

---

### Phase 2: Auth System ⚠️ AUTH — CHẠY TRƯỚC PHASE 3

> ⚠️ **PHẢI chạy TRƯỚC Phase 3** — bảng `users` phải có trước khi tạo các bảng/cột có `actor_id`/`completed_by` FK → `users`. Mỗi bước BẮT BUỘC `security-audit-stride` trước merge.

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 2.1 | Auth design + ADR + security-audit-stride ⚠️ CTO/EM approve bắt buộc trước 2.2 | tech-lead → cto | ✅ | `steps/STEP-2.1-auth-design-security-audit.md` | 2026-08-04 20:06 |
| 2.2 | Auth implementation (JWT/session, bảng `users`, middleware) ⚠️ security-audit-stride trước merge | senior-developer | ✅ | `steps/STEP-2.2-auth-implementation.md` | 2026-08-05 08:18 |
| 2.3 | Review workflow: role annotator vs reviewer, trạng thái ảnh (draft/in-review/approved) ⚠️ security-audit-stride trước merge | senior-developer | ✅ | `steps/STEP-2.3-review-workflow.md` | 2026-08-05 09:09 |

---

### Phase 3: Schema mở rộng & Lịch sử annotation

> ⚠️ **RỦI RO: ĐỤNG SCHEMA HIỆN CÓ** — Bước 3.1 thêm cột vào bảng `annotations` (có dữ liệu thực) và tạo bảng mới với FK → `users` (Phase 2 phải xong trước). BẮT BUỘC CTO/EM approve + `security-audit-stride` trước merge bước 3.1.

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 3.1 | DB Migration: `annotation_history`, `activity_log` (với `actor_id` FK), cột `version` vào `annotations` ⚠️ CTO/EM+security-audit | senior-developer + cto | ✅ | `steps/STEP-3.1-db-migration-schema.md` | 2026-08-05 09:24 |
| 3.2 | Annotation history + audit trail (API + lưu snapshot trước/sau mỗi save + actor_id) | senior-developer | ✅ | `steps/STEP-3.2-annotation-history.md` | 2026-08-05 09:32 |
| 3.3 | Activity log cấp project (upload/export/đổi split, timestamp, actor_id) | junior-developer | ✅ | `steps/STEP-3.3-activity-log.md` | 2026-08-05 02:41 |
| 3.4 | Optimistic locking / conflict detection annotation (dựa trên cột `version`) | senior-developer | ✅ | `steps/STEP-3.4-optimistic-locking.md` | 2026-08-05 10:00 |
| 3.5 | Đánh dấu ảnh "Xong" (done): cột `completed_at` + `completed_by` FK → `users` vào `images`; UI nút/phím tắt confirm done | senior-developer | ✅ | `steps/STEP-3.5-image-done-status.md` | 2026-08-05 03:20 |

---

### Phase 4: Cache phát hiện & Prefill bbox

> Phụ thuộc Phase 1 (inference service thường trực 1.1).

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 4.1 | Cache kết quả detect theo ảnh (persist, tương tự detect_cache.py tool cũ) | senior-developer | ✅ | `steps/STEP-4.1-detect-cache.md` | 2026-08-05 10:33 |
| 4.2 | Prefill bbox tự động khi mở ảnh chưa label (detect nền + gợi ý sẵn box) | senior-developer | ✅ | `steps/STEP-4.2-prefill-bbox.md` | 2026-08-05 10:51 |

---

### Phase 5: UX & Workflow cải tiến

> Không đụng schema nhạy cảm. Một số bước phụ thuộc Phase 1 và Phase 3.

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 5.1 | Undo/Redo thật ở tầng ứng dụng (snapshot stack, không chỉ undo điểm vẽ) | senior-developer | ✅ | `steps/STEP-5.1-undo-redo.md` | 2026-08-05 11:06 |
| 5.2 | Copy nhãn từ ảnh trước sang ảnh hiện tại (phím tắt, hữu ích cho chuỗi ảnh camera tĩnh) | junior-developer | ✅ | `steps/STEP-5.2-copy-labels.md` | 2026-08-05 11:13 |
| 5.3 | Batch operations: gán class hàng loạt, đổi split, xoá nhiều ảnh | junior-developer | ✅ | `steps/STEP-5.3-batch-operations.md` | 2026-08-05 11:25 |
| 5.4 | Filmstrip/grid xem nhanh nhiều ảnh (thumbnail async theo batch) | senior-developer | ✅ | `steps/STEP-5.4-filmstrip-grid.md` | 2026-08-05 11:32 |
| 5.5 | Quick class switcher: MRU phím 1-9, fuzzy search Ctrl+K, hotkey 2 ký tự, hiển thị bảng hotkey | senior-developer | ✅ | `steps/STEP-5.5-class-switcher.md` | 2026-08-05 11:42 |

---

### Phase 6: Tính năng nâng cao

> Độc lập nhau, có thể chạy song song sau Phase 0. SAM polygon đã bị loại khỏi scope.

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 6.1 | Model versioning + metadata so sánh hiệu năng (ngày train, dataset, mAP) | junior-developer | ✅ | `steps/STEP-6.1-model-versioning.md` | 2026-08-05 11:53 |
| 6.2 | Coverage-based sampling khi thu thập ảnh tự động | senior-developer | ⏭️ | `steps/STEP-6.2-coverage-sampling.md` | Skipped 2026-08-05 11:56 — user chọn bỏ qua, không phù hợp kiến trúc upload thủ công hiện tại |
| 6.3 | Duplicate detection + validate dataset (ảnh trùng, annotation lỗi, class không dùng) | junior-developer | ✅ | `steps/STEP-6.3-duplicate-validate.md` | 2026-08-05 05:08 |

---

## Artifacts dự kiến (tổng)

- [ ] `code-graph/CODE-GRAPH.md` + `.pdf` (Phase 0)
- [ ] `docs/tech-design/TDD-labeling-studio-improve.md` + ADR (Phase 0)
- [ ] `docs/architecture/ADR-auth-labeling-studio.md` (Phase 2.1)
- [ ] `server/src/routes/auth.js` + middleware (Phase 2.2)
- [x] `server/src/routes/reviews.js` (Phase 2.3 — hoàn thành, đổi tên số nhiều so với kế hoạch ban đầu)
- [ ] `server/src/python/inference_service.py` — FastAPI service (Phase 1.1)
- [ ] `server/src/routes/autolabel.js` — refactor gọi HTTP (Phase 1.1)
- [ ] `server/src/routes/jobs.js` + migration SQL (Phase 1.2)
- [ ] `server/src/routes/thumbnails.js` (Phase 1.3)
- [ ] DB migration scripts `server/migrations/003-009` (Phase 3.1, 3.5)
- [ ] `server/src/routes/history.js` (Phase 3.2)
- [ ] `server/src/routes/activity.js` (Phase 3.3)
- [ ] `client/src/` — UI cho filmstrip, undo/redo, batch ops, copy labels, done status, class switcher, auth
- [ ] `server/src/python/detect_cache.py` (Phase 4.1)
- [ ] `docs/test-cases/` — TC cho từng feature
- [ ] `docs/prd/`, `docs/user-stories/` — PRD + US cho từng feature

## Blockers

Không có hiện tại.

## Quyết định / Ghi chú tổng

1. **Auth trước DB History (v2):** Phase 2 (Auth) bắt buộc trước Phase 3 — bảng `users` phải tồn tại trước FK `actor_id`/`completed_by`.
2. **SAM loại khỏi scope (v2):** File `steps/STEP-6.1-sam-polygon.md` (cũ) đã đánh dấu CANCELLED.
3. **Image done status (v3):** Dùng 2 cột riêng `completed_at DATETIME` + `completed_by INTEGER FK → users.id` (nullable) thay vì mở rộng enum `status` — tách biệt rõ "đã xong" vs "đang label dở". Migration riêng (bước 3.5).
4. **Class switcher (v3):** Thiết kế MRU + fuzzy search Ctrl+K + hotkey 2 ký tự — thuần frontend, không cần DB mới.
5. **Inference service**: FastAPI tại `localhost:8001`; `infer.py` cũ giữ nguyên để rollback.
6. **DB Migration strategy**: Script SQL đánh số, idempotent. Backup DB trước migration 3.1.
7. **Two-Eyes bắt buộc**: Toàn bộ Phase 2 và bước 3.1 — KHÔNG merge khi chưa có CTO/EM approve ghi rõ trong step file.

## Lịch sử cập nhật

| Ngày | Cập nhật | Agent |
|------|----------|-------|
| 2026-08-04 | Plan tạo mới — 22 bước, 6 phase (v1) | task-planner |
| 2026-08-04 | v2: Auth từ Phase 5 → Phase 2; xoá SAM; tái đánh số phases; 22→21 bước | task-planner |
| 2026-08-04 | v3: Thêm step 3.5 (image done status) + step 5.5 (class switcher); 21→23 bước | task-planner |
| 2026-08-04 | Bước 0.1 ✅ Done — CODE-GRAPH tạo xong, commit 7118fe1 | senior-developer |
| 2026-08-04 | Bước 0.2 ✅ Done — TDD + ADR (10 AD) tạo xong, CTO APPROVED (điều kiện #1: verify row count trước/sau migration 3.1) | tech-lead + cto |
| 2026-08-04 16:42 | Bước 1.1 ✅ Done — inference_service.py + autolabel HTTP refactor + Node lifecycle. Commit 9f943a1. Tested: /health, /predict 404, /warmup 404, Node spawn/kill lifecycle OK. | senior-developer |
| 2026-08-04 16:53 | Bước 1.2 ✅ Done — bảng jobs SQLite (12 cột, 2 indexes, startup cleanup), routes/jobs.js CRUD, autolabel DB-backed job tracking. Commit c6aebaf. Tested: schema verify, restart→error, /api/jobs endpoints. | senior-developer |
| 2026-08-04 17:04 | Bước 1.3 ✅ Done — thumbnail service lazy on-demand (sharp, cache server/data/thumbnails/), API list images trả thumbnail_url, client grid dùng thumbnail. Commit 8214474. Tested: 800×600 PNG (104KB) → thumb 3.1KB, cache, custom size, 404 image không tồn tại. **Phase 1 HOÀN THÀNH.** | junior-developer |
| 2026-08-04 20:06 | Bước 2.1 ✅ Done — ADR-auth-labeling-studio.md (10 mục, 8 AD-A). Chốt JWT HS256 24h, bcrypt cost=12, middleware GLOBAL cả GET, role matrix chi tiết ~20 endpoint, seed admin trong migration, rate-limit 10/15p `POST /api/auth/login`, CORS siết theo env, secret env bắt buộc prod. Security-audit-stride: 0 Fail HIGH, 5 warning MED đã fold vào AD. CTO APPROVED kèm 2 điều kiện #A1 #A2 cho bước 2.2. EM APPROVED. DOCX xuất OK (PDF lỗi RPC docx2pdf, ⚠️ đã biết). | tech-lead + cto + em |
| 2026-08-05 08:18 | Bước 2.2 ✅ Done — bảng `users` (INTEGER id, role, color), routes auth.js/users.js, middleware, LoginPage. Commit c58dd8c + 70d1f1e (npm audit fix brace-expansion High). Điều kiện CTO #A1 (test đủ ma trận AD-A5) + #A2 (npm audit sạch auth packages) đều đạt — 79→87 test pass. | senior-developer |
| 2026-08-05 09:09 | Bước 2.3 ✅ Done — 4 cột review trên bảng `images`, routes/reviews.js (submit-review/approve/reject + role guard), Row 8 test (8 case) pass. Client: nút Gửi duyệt/Duyệt/Từ chối, filter + badge review. Commit 7775e9b. Test: 87 passed, 0 failed, 3 skipped. tsc --noEmit: 0 lỗi. **Phase 2 (Auth) HOÀN THÀNH.** | senior-developer |
| 2026-08-05 09:24 | Bước 3.1 ✅ Done — cột `annotations.version` DEFAULT 0, bảng mới `annotation_history` (snapshot) + `activity_log`, auto-backup DB + verify row count trước/sau (CTO condition #1). Kết quả verify: 7 bảng, 0 mất dữ liệu (projects 2→2, classes 4→4, images 1→1, annotations/models/jobs 0→0, users 1→1). Test: 87 passed sau migration (không đổi). SNAPSHOT strategy theo ADR AD-5 (không diff). | senior-developer |
| 2026-08-05 10:00 | Bước 3.4 ✅ Done — Optimistic locking: 409 ANNOTATION_CONFLICT khi version lệch, backward compat (skip check nếu không gửi expectedVersion), response PUT đổi thành {annotations, annotationVersion}. GET /:imageId trả thêm annotationVersion. Client annotationVersionRef + 409 handling. Row 18 test (12 case). 113 passed, 0 failed, tsc 0 lỗi. Commit 9270a82. | senior-developer |
| 2026-08-05 03:20 | Bước 3.5 ✅ Done — m006 migration (completed_at/completed_by), POST/DELETE mark-done, submit-review gate IMAGE_NOT_COMPLETED, UI nút Xong + phím D, filter + badge ProjectDetailPage. Row 19 (15 case). 128 passed, 0 failed, tsc 0 lỗi. Commit ac61d98. **Phase 3 HOÀN TOÀN HOÀN THÀNH.** | senior-developer |
| 2026-08-05 10:33 | Bước 4.1 ✅ Done — bảng `detect_cache` (m007, image_id+model_id UNIQUE), cache RAW detections tại CACHE_RAW_CONF=0.01 + filter conf ở tầng app (đổi threshold không cần detect lại), `inference_service.py` trả thêm `conf`, `DELETE /cache` endpoint. Row 20 (5 case). 133 passed, 0 failed. | senior-developer |
| 2026-08-05 10:51 | Bước 4.2 ✅ Done — m008 `projects.default_model_id`, routes/prefill.js (GET prefill + PATCH default-model), AnnotatorPage auto-call prefill (setBoxes, không scheduleSave, banner UI), ProjectDetailPage UI chọn model mặc định (reviewer/admin), Row 21 (13 case). 146 passed, 0 failed. tsc 0 lỗi. Commit 3475fdd. **Phase 4 HOÀN THÀNH.** | senior-developer |
| 2026-08-05 11:32 | Bước 5.1–5.4 ✅ Done — undo/redo, copy labels from prev, batch operations, filmstrip. Commits bba89b3..a72b38c. 162 passed. | senior-developer |
| 2026-08-05 11:42 | Bước 5.5 ✅ Done — MRU 1-9, Ctrl+K fuzzy switcher, hotkey 2-char buffer. normalizeHotkey→2-char, fuzzyMatch(), switcher modal, sidebar MRU display. Commit 0adcf60. 162 passed, tsc 0 lỗi. **Phase 5 HOÀN THÀNH.** | senior-developer |
| 2026-08-05 11:53 | Bước 6.1 ✅ Done — m009 migration (notes/map_score/version_label), PATCH endpoint, UI sort+badge+inline edit. Commit b5b8feb. 175 passed (13 Row23 mới), tsc 0 lỗi. | junior-developer |
| 2026-08-05 11:56 | Bước 6.2 ⏭️ Skipped — hỏi user làm rõ scope (theo DoD), user chọn bỏ qua vì kiến trúc server hiện tại chỉ upload thủ công, không có tích hợp camera/API để áp dụng coverage sampling có ý nghĩa. | main-agent (theo yêu cầu user) |
| 2026-08-05 05:08 | Bước 6.3 ✅ Done — GET /api/projects/:id/validate (MD5 hash duplicate, annotation lỗi tọa độ, class không dùng), ValidateModal.tsx, Row 24 (18 test case). Commit a5903d8. 193 passed, 0 failed, tsc 0 lỗi. **Phase 6 HOÀN THÀNH. TOÀN BỘ PLAN 23 BƯỚC HOÀN THÀNH (21 Done + 1 Skipped + 1 bước 4.3 gộp vào 4.2).** | junior-developer |

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped
**Cách đọc nhanh:** đọc MASTER trước → nếu cần chi tiết bước cụ thể mới mở step file tương ứng.

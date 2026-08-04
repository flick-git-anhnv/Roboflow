---
task: labeling-studio-improve
created: 2026-08-04
updated: 2026-08-04
status: active
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
| 1.1 | Inference service Python thường trực (FastAPI, giữ model trong RAM, Node gọi HTTP) | senior-developer | ⬜ | `steps/STEP-1.1-inference-service-fastapi.md` | - |
| 1.2 | Persist bảng `jobs` cho auto-label (thay in-memory) | senior-developer | ⬜ | `steps/STEP-1.2-jobs-table-persist.md` | - |
| 1.3 | Thumbnail service (resize ảnh lớn, lưu cache, phục vụ grid/filmstrip) | junior-developer | ⬜ | `steps/STEP-1.3-thumbnail-service.md` | - |

---

### Phase 2: Auth System ⚠️ AUTH — CHẠY TRƯỚC PHASE 3

> ⚠️ **PHẢI chạy TRƯỚC Phase 3** — bảng `users` phải có trước khi tạo các bảng/cột có `actor_id`/`completed_by` FK → `users`. Mỗi bước BẮT BUỘC `security-audit-stride` trước merge.

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 2.1 | Auth design + ADR + security-audit-stride ⚠️ CTO/EM approve bắt buộc trước 2.2 | tech-lead → cto | ⬜ | `steps/STEP-2.1-auth-design-security-audit.md` | - |
| 2.2 | Auth implementation (JWT/session, bảng `users`, middleware) ⚠️ security-audit-stride trước merge | senior-developer | ⬜ | `steps/STEP-2.2-auth-implementation.md` | - |
| 2.3 | Review workflow: role annotator vs reviewer, trạng thái ảnh (draft/in-review/approved) ⚠️ security-audit-stride trước merge | senior-developer | ⬜ | `steps/STEP-2.3-review-workflow.md` | - |

---

### Phase 3: Schema mở rộng & Lịch sử annotation

> ⚠️ **RỦI RO: ĐỤNG SCHEMA HIỆN CÓ** — Bước 3.1 thêm cột vào bảng `annotations` (có dữ liệu thực) và tạo bảng mới với FK → `users` (Phase 2 phải xong trước). BẮT BUỘC CTO/EM approve + `security-audit-stride` trước merge bước 3.1.

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 3.1 | DB Migration: `annotation_history`, `activity_log` (với `actor_id` FK), cột `version` vào `annotations` ⚠️ CTO/EM+security-audit | senior-developer + cto | ⬜ | `steps/STEP-3.1-db-migration-schema.md` | - |
| 3.2 | Annotation history + audit trail (API + lưu snapshot trước/sau mỗi save + actor_id) | senior-developer | ⬜ | `steps/STEP-3.2-annotation-history.md` | - |
| 3.3 | Activity log cấp project (upload/export/đổi split, timestamp, actor_id) | junior-developer | ⬜ | `steps/STEP-3.3-activity-log.md` | - |
| 3.4 | Optimistic locking / conflict detection annotation (dựa trên cột `version`) | senior-developer | ⬜ | `steps/STEP-3.4-optimistic-locking.md` | - |
| 3.5 | Đánh dấu ảnh "Xong" (done): cột `completed_at` + `completed_by` FK → `users` vào `images`; UI nút/phím tắt confirm done | senior-developer | ⬜ | `steps/STEP-3.5-image-done-status.md` | - |

---

### Phase 4: Cache phát hiện & Prefill bbox

> Phụ thuộc Phase 1 (inference service thường trực 1.1).

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 4.1 | Cache kết quả detect theo ảnh (persist, tương tự detect_cache.py tool cũ) | senior-developer | ⬜ | `steps/STEP-4.1-detect-cache.md` | - |
| 4.2 | Prefill bbox tự động khi mở ảnh chưa label (detect nền + gợi ý sẵn box) | senior-developer | ⬜ | `steps/STEP-4.2-prefill-bbox.md` | - |

---

### Phase 5: UX & Workflow cải tiến

> Không đụng schema nhạy cảm. Một số bước phụ thuộc Phase 1 và Phase 3.

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 5.1 | Undo/Redo thật ở tầng ứng dụng (snapshot stack, không chỉ undo điểm vẽ) | senior-developer | ⬜ | `steps/STEP-5.1-undo-redo.md` | - |
| 5.2 | Copy nhãn từ ảnh trước sang ảnh hiện tại (phím tắt, hữu ích cho chuỗi ảnh camera tĩnh) | junior-developer | ⬜ | `steps/STEP-5.2-copy-labels.md` | - |
| 5.3 | Batch operations: gán class hàng loạt, đổi split, xoá nhiều ảnh | junior-developer | ⬜ | `steps/STEP-5.3-batch-operations.md` | - |
| 5.4 | Filmstrip/grid xem nhanh nhiều ảnh (thumbnail async theo batch) | senior-developer | ⬜ | `steps/STEP-5.4-filmstrip-grid.md` | - |
| 5.5 | Quick class switcher: MRU phím 1-9, fuzzy search Ctrl+K, hotkey 2 ký tự, hiển thị bảng hotkey | senior-developer | ⬜ | `steps/STEP-5.5-class-switcher.md` | - |

---

### Phase 6: Tính năng nâng cao

> Độc lập nhau, có thể chạy song song sau Phase 0. SAM polygon đã bị loại khỏi scope.

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 6.1 | Model versioning + metadata so sánh hiệu năng (ngày train, dataset, mAP) | junior-developer | ⬜ | `steps/STEP-6.1-model-versioning.md` | - |
| 6.2 | Coverage-based sampling khi thu thập ảnh tự động | senior-developer | ⬜ | `steps/STEP-6.2-coverage-sampling.md` | - |
| 6.3 | Duplicate detection + validate dataset (ảnh trùng, annotation lỗi, class không dùng) | junior-developer | ⬜ | `steps/STEP-6.3-duplicate-validate.md` | - |

---

## Artifacts dự kiến (tổng)

- [ ] `code-graph/CODE-GRAPH.md` + `.pdf` (Phase 0)
- [ ] `docs/tech-design/TDD-labeling-studio-improve.md` + ADR (Phase 0)
- [ ] `docs/architecture/ADR-auth-labeling-studio.md` (Phase 2.1)
- [ ] `server/src/routes/auth.js` + middleware (Phase 2.2)
- [ ] `server/src/routes/review.js` (Phase 2.3)
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

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped
**Cách đọc nhanh:** đọc MASTER trước → nếu cần chi tiết bước cụ thể mới mở step file tương ứng.

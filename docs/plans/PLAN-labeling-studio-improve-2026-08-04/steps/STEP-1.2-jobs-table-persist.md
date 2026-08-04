---
step: "1.2"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: "2026-08-04 16:53"
deps: ["0.2"]
---

# STEP 1.2 — Persist bảng `jobs` cho auto-label

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD tại `docs/tech-design/TDD-labeling-studio-improve.md` — đọc mục "Schema migration plan" (bảng `jobs` là bảng MỚI, không sửa bảng cũ) và mục "API contracts mới".

## Nhiệm vụ

Tạo bảng `jobs` mới trong SQLite để persist trạng thái auto-label job (thay in-memory hiện tại trong `autolabel.js`). Mỗi job có: `id, project_id, status (pending/running/done/error), total_images, processed, created_at, updated_at, error_msg`. Thêm API endpoints CRUD cho jobs.

## Definition of Done

- [ ] Migration SQL `server/migrations/001_create_jobs.sql` tạo xong (CREATE TABLE IF NOT EXISTS)
- [ ] `server/src/db.js` — chạy migration khi khởi động (tự động nếu bảng chưa tồn tại)
- [ ] `server/src/routes/jobs.js` — endpoints: `GET /api/jobs?projectId=`, `GET /api/jobs/:id`, `DELETE /api/jobs/:id`
- [ ] `server/src/routes/autolabel.js` — lưu job vào DB khi bắt đầu, cập nhật status/progress/error khi chạy
- [ ] Sau khi server restart, các job cũ (status: running/pending) chuyển sang `error` với message "Server restarted"
- [ ] TL review + approve PR
- [ ] QA smoke test: chạy auto-label, restart server, kiểm tra job vẫn còn trong DB với status error
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. Thêm `CREATE TABLE IF NOT EXISTS jobs` (12 cột) + 2 indexes vào `server/src/db.js` bên trong `db.exec()` block idempotent.
2. Thêm startup cleanup logic: `UPDATE jobs SET status='error' WHERE status IN ('running','pending')` — chạy mỗi lần server start, mark job dở dang.
3. Tạo `server/migrations/001_create_jobs.sql` — bản sao SQL tham khảo.
4. Thêm 3 DB helper functions vào `autolabel.js`: `createJobInDB`, `syncJobToDB`, `getJobFromDB`.
5. Cập nhật POST handler: gọi `createJobInDB` ngay khi tạo job; HTTP mode dùng `.then()/.catch()` để sync final state; legacy mode dùng `setInterval(500ms)` để detect done/error rồi sync.
6. Cập nhật GET handler: check memory Map trước (active job), fall-back DB (completed/sau restart).
7. Tạo `server/src/routes/jobs.js`: `GET /api/jobs?projectId`, `GET /api/jobs/:id`, `DELETE /api/jobs/:id`.
8. Cập nhật `server/src/index.js`: import + mount jobsRouter tại `/api/jobs`.
9. Cập nhật `code-graph/CODE-GRAPH.md` + xuất `.docx` (PDF lỗi docx2pdf RPC — ghi chú ⚠️).

**Test thực tế đã chạy:**
- Node script verify bảng `jobs` tạo đúng 12 cột + 2 custom indexes ✅
- Insert `running` + `done` job → import db.js lại (simulate restart) → running→error, done→done ✅
- Server start HTTP: GET /api/jobs (400 khi thiếu projectId) ✅; GET /api/jobs?projectId=xxx → `[]` ✅
- GET /api/jobs/nonexistent → `{error: "Không tìm thấy job"}` ✅
- DELETE /api/jobs/nonexistent → 404 ✅
- GET /api/projects/x/auto-label/fake-id → 404 (fall-back DB, không tìm thấy) ✅

## Artifact

- `server/src/db.js` — thêm bảng jobs + indexes + startup cleanup (sửa)
- `server/migrations/001_create_jobs.sql` — migration SQL tham khảo (tạo mới)
- `server/src/routes/jobs.js` — CRUD /api/jobs (tạo mới)
- `server/src/index.js` — mount jobsRouter (sửa)
- `server/src/routes/autolabel.js` — DB helpers + cập nhật POST/GET handler (sửa)
- `code-graph/CODE-GRAPH.md` — cập nhật §2,3.1,3.2,3.10,3.11,6,7,9,10 (sửa)
- `code-graph/CODE-GRAPH.docx` — xuất lại (⚠️ PDF lỗi docx2pdf RPC trên Windows)

## Quyết định quan trọng

1. **Không FK từ jobs → projects**: thiết kế có chủ ý — job history giữ lại kể cả khi project bị xóa. Phase sau nếu muốn cleanup → thêm `DELETE FROM jobs WHERE project_id=?` vào routes/projects.js khi DELETE project.
2. **Memory Map giữ nguyên cho active jobs**: không dùng DB polling để không tạo nhiều DB reads trong lúc inference đang chạy. Map chỉ xóa entry khi inference xong và sync DB xong.
3. **Không sửa `runInferenceHTTP` và `runInference`** (theo do_not_redo từ STEP-1.1) — sync được thực hiện ở caller level trong router handler.
4. **Legacy mode sync**: `setInterval(500ms)` không lý tưởng nhưng là cách duy nhất không đụng vào `runInference`. Interval tự clear khi phát hiện job done/error.

## Handoff Payload — bước sau đọc phần này

- **do_not_redo**: db.js đã có bảng `jobs` — không tạo lại. autolabel.js đã có DB helpers (`createJobInDB`, `syncJobToDB`, `getJobFromDB`) — không viết lại. jobs.js đã có CRUD endpoints.
- **watch_out**: (1) Bảng `jobs` KHÔNG có FK tới `projects` — khi phase sau cần cleanup jobs theo project, phải thêm explicit DELETE trong projects.js. (2) `server/src/db.js` bây giờ có bước startup UPDATE — nếu phase sau thêm bảng mới cần startup cleanup tương tự, thêm vào cuối file theo cùng pattern. (3) `autolabel.js` dòng khoảng ~350 là GET handler đã dùng DB fall-back — STEP-1.3 nếu thêm thumbnail sẽ không ảnh hưởng route này.
- **next_inputs**: STEP-1.3 (thumbnail service) — không phụ thuộc trực tiếp vào STEP-1.2. Tham khảo `code-graph/CODE-GRAPH.md §9 Phase 1.3` (nếu có) hoặc `TDD-labeling-studio-improve.md` mục thumbnail.

## Commit

- Hash: c6aebaf
- Đã push: có (origin/Improve)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

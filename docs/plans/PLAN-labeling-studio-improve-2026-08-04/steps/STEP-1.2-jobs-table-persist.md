---
step: "1.2"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
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

[Điền SAU khi hoàn thành]

## Artifact

[Điền SAU khi hoàn thành]

## Quyết định quan trọng

[Điền SAU khi hoàn thành]

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Không có
- watch_out: Không có
- next_inputs: Không có

## Commit

- Hash: [điền sau khi commit]
- Đã push: [có/không]

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

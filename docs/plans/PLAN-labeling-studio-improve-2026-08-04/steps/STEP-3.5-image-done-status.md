---
step: "3.5"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["2.2", "3.1"]
---

# STEP 3.5 — Đánh dấu ảnh "Xong" (done status)

## Input nhận

Từ STEP-2.2 Handoff Payload: bảng `users` và middleware auth đang hoạt động (cần để lưu `completed_by` FK).
Từ STEP-3.1 Handoff Payload: migrations 003-005 đã chạy, naming convention migration đã được thiết lập. Đọc handoff 3.1 trước khi viết migration 009.

## Nhiệm vụ

Thêm khả năng người label xác nhận "đã xong" cho một ảnh — khác với việc chỉ có annotation (có thể đang label dở). Thiết kế: thêm 2 cột nullable `completed_at DATETIME` + `completed_by INTEGER FK → users.id` vào bảng `images` (thay vì mở rộng enum `status` hiện có — tách biệt rõ "có nhãn" và "người label xác nhận xong"). UI: nút/phím tắt trong AnnotatorPage, hiển thị trạng thái khác màu trong grid/filmstrip.

## Definition of Done

- [ ] Migration `server/migrations/009_add_image_done_columns.sql` — `ALTER TABLE images ADD COLUMN completed_at DATETIME; ALTER TABLE images ADD COLUMN completed_by INTEGER REFERENCES users(id);`
- [ ] `server/src/routes/images.js` — `POST /api/images/:id/mark-done` (annotator+admin role, sets `completed_at = now(), completed_by = req.user.id`); `DELETE /api/images/:id/mark-done` (undo done, chỉ người đã mark hoặc admin)
- [ ] `GET /api/images` và `GET /api/projects/:id/images` trả kèm `completed_at`, `completed_by` trong response
- [ ] `client/src/pages/AnnotatorPage.tsx` — nút "Xong" (hoặc phím tắt D) đổi màu khi đã done; click lại để undo (với confirm)
- [ ] `client/src/pages/ProjectDetailPage.tsx` — badge màu xanh lá (hoặc checkmark) cho ảnh done trong grid/list; filmstrip cũng phân biệt màu
- [ ] Tích hợp với review workflow (2.3): khi annotator submit for review → tự động mark done nếu chưa done
- [ ] `activity_log` ghi event `image_marked_done` (nếu bước 3.3 chưa xong → skip, nối vào sau)
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7 (visual distinction done vs labeled vs unlabeled)
- [ ] TL review + approve PR
- [ ] QA smoke test: mark 3 ảnh done → verify `completed_at` + `completed_by` trong DB; undo done → verify null; grid hiển thị badge đúng
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

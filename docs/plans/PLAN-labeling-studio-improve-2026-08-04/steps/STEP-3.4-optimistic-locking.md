---
step: "3.4"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["3.1", "3.2"]
---

# STEP 3.4 — Optimistic locking / conflict detection annotation

## Input nhận

Từ STEP-3.2 Handoff Payload: cột `version` trên `annotations` đang hoạt động, history đã ghi. Đọc handoff 3.2 trước khi code.

## Nhiệm vụ

Implement optimistic locking cho annotation save: khi client gửi PUT save annotations, request PHẢI kèm `version` hiện tại của client. Server kiểm tra `version` trong DB — nếu không khớp (client khác đã save trước) → trả 409 Conflict thay vì ghi đè âm thầm. Client nhận 409 → hiển thị dialog cảnh báo "Ảnh này đã bị sửa bởi session khác. Tải lại để xem bản mới nhất."

## Definition of Done

- [ ] `server/src/routes/annotations.js` — PUT save annotation: đọc `version` từ request body, kiểm tra với DB, nếu lệch → 409 `{error: "conflict", serverVersion: N, message: "..."}`
- [ ] `server/src/routes/annotations.js` — GET annotations trả kèm `version` hiện tại
- [ ] `client/src/pages/AnnotatorPage.tsx` — lưu `version` nhận được khi load ảnh, gửi kèm khi save
- [ ] Client xử lý 409: hiển thị dialog với 2 lựa chọn "Tải lại (mất thay đổi hiện tại)" hoặc "Huỷ (giữ thay đổi local)"
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: mở cùng 1 ảnh trên 2 tab, save từ tab 1, save từ tab 2 → verify tab 2 nhận 409 và dialog hiện ra
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

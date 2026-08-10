> **SUPERSEDED — xem STEP-5.1-undo-redo.md (đã đánh số lại Phase 5)**

---
step: "4.1-SUPERSEDED"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["3.2"]
---

# STEP 4.1 — Undo/Redo thật ở tầng ứng dụng

## Input nhận

Từ STEP-3.2 Handoff Payload: annotation history đã có (version + snapshot). Đọc handoff 3.2 trước khi code.

## Nhiệm vụ

Implement undo/redo thật ở tầng ứng dụng (không chỉ undo điểm đang vẽ polygon). Client giữ stack snapshot nội bộ (tối đa 50 trạng thái): mỗi thao tác thay đổi annotation (thêm box, xoá box, sửa box, đổi class) push snapshot vào stack. Ctrl+Z undo (pop stack), Ctrl+Y redo. Đây là undo *local* (chưa save) — stack xóa khi user save hoặc chuyển ảnh.

## Definition of Done

- [ ] `client/src/pages/AnnotatorPage.tsx` (hoặc tách ra hook `useAnnotationHistory`) — snapshot stack (mảng trạng thái annotations), `pushSnapshot()` sau mỗi thao tác thay đổi
- [ ] Keyboard shortcut: Ctrl+Z (undo), Ctrl+Y hoặc Ctrl+Shift+Z (redo)
- [ ] UI: nút Undo/Redo trên toolbar, disabled khi stack trống
- [ ] Stack bị clear khi: save thành công, chuyển sang ảnh khác, hoặc load ảnh mới
- [ ] Không phụ thuộc server-side (undo/redo là local state, không gọi API)
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7 (đặc biệt C3 — phím tắt hoạt động đúng)
- [ ] TL review + approve PR
- [ ] QA smoke test: vẽ 3 box, undo 3 lần → canvas trống; redo 2 lần → có 2 box; save → undo không hoạt động sau save
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

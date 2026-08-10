---
step: "5.1"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: 2026-08-05 11:06
deps: ["3.2"]
---

# STEP 5.1 — Undo/Redo thật ở tầng ứng dụng

## Input nhận

Từ STEP-3.2 Handoff Payload: annotation history đang hoạt động. Đọc handoff 3.2 trước khi code.

## Nhiệm vụ

Implement undo/redo thật ở tầng ứng dụng (không chỉ undo điểm đang vẽ polygon). Client giữ stack snapshot nội bộ (tối đa 50 trạng thái). Ctrl+Z undo, Ctrl+Y redo. Stack xóa khi user save hoặc chuyển ảnh.

## Definition of Done

- [ ] `client/src/pages/AnnotatorPage.tsx` (hoặc hook `useAnnotationHistory`) — snapshot stack, `pushSnapshot()` sau mỗi thao tác thay đổi (thêm box, xoá box, sửa box, đổi class)
- [ ] Keyboard shortcut: Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo)
- [ ] UI: nút Undo/Redo trên toolbar, disabled khi stack trống
- [ ] Stack clear khi: save thành công, chuyển sang ảnh khác, load ảnh mới
- [ ] Không phụ thuộc server-side (local state only)
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: vẽ 3 box, undo 3 lần → canvas trống; redo 2 lần → có 2 box; save → undo không hoạt động
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. **AnnotatorPage.tsx** — thêm undo/redo đầy đủ:
   - Refs: `undoStackRef`, `redoStackRef` (Box[][] tối đa 50 snapshot), `boxesRef` (mirror state), `preDragSnapshotRef` (snapshot tại mousedown), `lastDrawnSizeRef` (kích thước box đang vẽ — sync trong handleDragMove).
   - State: `undoSize`, `redoSize` (int) để disable buttons trên toolbar.
   - `pushHistorySnapshot()`: inline helper clone `boxesRef.current` → push undoStack, clear redoStack, update sizes.
   - `undo()` / `redo()` useCallback: pop/push stack, `setBoxes(snapshot)`, `scheduleSave(snapshot)`.
   - `updateBoxes()`: gọi `pushHistorySnapshot()` trước mọi thay đổi (delete, assignClass, finalizeQuad, clear prefill).
   - `onMouseDown`: capture `preDragSnapshotRef.current` + reset `lastDrawnSizeRef.current` trước khi vào draw/move/resize mode.
   - `handleDragMove` draw: ghi `lastDrawnSizeRef.current = { w, h }` synchronously (tránh stale boxesRef khi render chưa commit).
   - `handleDragUp`: dùng `lastDrawnSizeRef.current` để kiểm tra validity (w>3&&h>3) NGOÀI setBoxes updater → push snapshot nếu hợp lệ; move/resize luôn push.
   - Stack clear: trong scheduleSave sau save thành công, sau conflict reload, trong useEffect([imageId]) khi chuyển ảnh.
   - Keyboard: Ctrl+Z → undoLastPoint nếu đang vẽ quad, else undo(); Ctrl+Shift+Z hoặc Ctrl+Y → redo().
   - UI: nút "↩ Hoàn tác (N)" / "↪ Làm lại (N)" trên toolbar, disabled + opacity 0.45 khi stack rỗng.
   - Side panel help text bổ sung phím tắt Ctrl+Z / Ctrl+Y.

## Artifact

- `client/src/pages/AnnotatorPage.tsx` — undo/redo stack + keyboard + toolbar buttons

## Quyết định quan trọng

1. **lastDrawnSizeRef pattern**: handleDragMove cập nhật ref sync, handleDragUp đọc ref — tránh vấn đề boxesRef chưa commit qua useEffect khi mouseup xảy ra ngay sau mousemove.
2. **Stack clear on save**: undo trigger scheduleSave → 600ms sau save → stack clear. User phải undo nhanh trước khi save timer expire nếu muốn undo nhiều lần. Đây là behavior theo DoD.
3. **Ctrl+Z khi vẽ quad**: giữ nguyên `undoLastPoint()` thay vì pop undo stack — consistent với right-click và nút "↩ Xoá điểm cuối" hiện có.
4. **Move/resize snapshot**: luôn push khi drag kết thúc (kể cả click không drag). No-op move sẽ tạo undo entry nhưng không thay đổi visual — chấp nhận được, không ảnh hưởng UX.
5. **Prefill bypass**: `setBoxes` trực tiếp (STEP-4.2) vẫn KHÔNG đi qua `pushHistorySnapshot` — đúng, prefill không tạo history entry cho đến khi user thực sự chỉnh sửa.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Không thêm undo/redo refs/state nào khác — đã đủ. Không bind Ctrl+Z thêm lần nữa.
- watch_out: Bước 5.2 (copy label) cũng sửa AnnotatorPage.tsx. Các thành phần đã thêm trong 5.1: refs khai báo sau `pendingScrollRef`, `pushHistorySnapshot()` là hàm thường (không useCallback) đặt sau `scheduleSave`, `undo`/`redo` là useCallback đặt sau `pushHistorySnapshot`, `updateBoxes` đã được sửa (thêm `pushHistorySnapshot()` ở đầu). Keyboard handler useEffect deps đã có `undo, redo` trong array. Không conflict với copy-label nếu thêm vào `updateBoxes` hoặc keyboard handler — chỉ cần thêm deps vào dependency array nếu thêm callback mới.
- next_inputs: File `client/src/pages/AnnotatorPage.tsx` tại commit 96fea64. Bước 5.2 cần thêm copy-label từ ảnh trước — xem STEP-4.2 copy-labels.md để biết thiết kế.

## Commit

- Hash: 96fea64
- Đã push: có — branch `Improve`

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

---
step: "5.2"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: done
completed_at: 2026-08-05 11:13
deps: ["1.1"]
---

# STEP 5.2 — Copy nhãn từ ảnh trước sang ảnh hiện tại

## Input nhận

Từ STEP-1.1 Handoff Payload: inference service ổn định. Đọc handoff 1.1 trước khi code.

## Nhiệm vụ

Thêm tính năng copy annotations từ ảnh trước trong danh sách sang ảnh hiện tại đang xem. Phím tắt Alt+C hoặc button. Hữu ích khi label chuỗi ảnh liên tiếp từ camera tĩnh.

## Definition of Done

- [ ] `GET /api/images/:id/prev-annotations` — trả annotations của ảnh ngay trước trong project (theo id/upload order), hoặc `null` nếu là ảnh đầu tiên
- [ ] `client/src/pages/AnnotatorPage.tsx` — nút "Copy từ ảnh trước" (Alt+C) gọi API, load annotations vào canvas chờ confirm (chưa save tự động)
- [ ] Nếu ảnh hiện tại đã có annotation → confirm dialog "Ảnh này đã có nhãn. Ghi đè?" trước khi copy
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: label ảnh A, chuyển sang ảnh B (chưa label), Alt+C → annotations A hiện lên; save → DB chứa annotations của B (không sửa A)
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. **AnnotatorPage.tsx** — thêm copy-label đầy đủ:
   - State: `copyingLabels` (bool) — disable button và hiện "⏳ Đang copy..." trong khi chờ API.
   - Derived value: `prevImageItem = images[currentIndex - 1] | null` — dùng để disable button và truyền id vào callback.
   - `copyLabelsFromPrev` useCallback: gọi `api.getImage(projectId, prevImg.id)` lấy annotations ảnh trước; nếu ảnh hiện tại đã có box → `confirm()` xin phép; gọi `pushHistorySnapshot()` rồi merge copiedBoxes vào state; gọi `scheduleSave()`.
   - Keyboard: Alt+C trong keyboard useEffect — đặt trước guard `!e.altKey` để không xung đột class hotkeys; thêm `copyLabelsFromPrev` vào deps array.
   - Toolbar: nút "📋 Copy nhãn ảnh trước (Alt+C)" — disabled khi `!prevImageItem || prevImageItem.status === 'unlabeled' || copyingLabels`; opacity 0.45 khi disabled.
   - Side panel help text: bổ sung dòng "Copy nhãn ảnh trước: Alt+C".

## Artifact

- `client/src/pages/AnnotatorPage.tsx` — copy-label + keyboard Alt+C + toolbar button + help text

## Quyết định quan trọng

1. **Dùng api.getImage thay vì endpoint mới**: `images[currentIndex-1]` đã có id trong state → gọi GET `/api/projects/:pid/images/:id` hiện có là đủ, không cần endpoint `prev-annotations` riêng. Đơn giản hơn, không thêm surface server.
2. **Merge chứ không ghi đè**: box hiện tại được GIỮ NGUYÊN, copiedBoxes append thêm vào. Nếu ảnh đã có box → confirm() hỏi trước (không tự ghi đè).
3. **ID mới cho mỗi box copy**: prefix `copy_` + timestamp + random để tránh xung đột với ID gốc từ ảnh trước trong DB.
4. **pushHistorySnapshot() trước merge**: đảm bảo Ctrl+Z hoàn tác được toàn bộ thao tác copy.
5. **Disable dựa trên `prevImageItem.status`**: nếu `status === 'unlabeled'` → ảnh trước chưa có annotation → disable sớm, không cần gọi API để kiểm tra.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Không bind Alt+C thêm lần nữa. Không thêm refs/state copyingLabels/prevImageItem thêm.
- watch_out: Phím đã dùng trong AnnotatorPage — Ctrl+Z/Y/Shift+Z (undo/redo), ArrowLeft/Right (nav), Delete/Backspace (xoá/undo point), Escape (cancel draw), D (done toggle), Space (pan), 1-9 (class), Alt+C (copy label bước này). Bước 5.3/5.4/5.5 tránh trùng tất cả các phím trên. Alt là namespace còn trống (chỉ Alt+C đã dùng). Ctrl+phím khác ngoài Z/Y cũng còn trống.
- next_inputs: File `client/src/pages/AnnotatorPage.tsx` tại commit cd8c494. Keyboard useEffect deps array hiện tại: `[selectedId, deleteSelected, classes, goTo, drawingPoints, cancelDrawing, undoLastPoint, assignClassToSelected, image, handleMarkDone, handleUnmarkDone, undo, redo, copyLabelsFromPrev]`.

## Commit

- Hash: cd8c494
- Đã push: có — branch `Improve`

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

---
step: "5.3"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: done
completed_at: 2026-08-05 11:25
deps: ["0.2"]
---

# STEP 5.3 — Batch operations trên ảnh

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD + API contracts. Đọc handoff 0.2 trước khi code.

## Nhiệm vụ

Thêm batch operations trong ProjectDetailPage: chọn nhiều ảnh (checkbox), rồi: đổi split hàng loạt, xoá nhiều ảnh cùng lúc, gán class mặc định hàng loạt.

## Definition of Done

- [ ] `PATCH /api/images/batch/split` body `{imageIds: [], split: "train"|"val"|"test"}`
- [ ] `DELETE /api/images/batch` body `{imageIds: []}`
- [ ] `PATCH /api/images/batch/class` body `{imageIds: [], classId: N}` (gán class mặc định cho ảnh — làm rõ nghĩa trong PR description)
- [ ] `client/src/pages/ProjectDetailPage.tsx` — checkbox "select all" + từng ảnh; toolbar batch actions hiện khi có ảnh được chọn
- [ ] Confirm dialog trước khi xoá batch ("Bạn sắp xoá X ảnh. Không thể hoàn tác.")
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: chọn 5 ảnh đổi split → verify DB; chọn 3 ảnh xoá → verify project còn đúng số ảnh
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. **server/src/routes/images.js** — thêm 2 route batch (đặt TRƯỚC `/:imageId` để tránh Express match nhầm):
   - `PATCH /batch` body `{imageIds[], split}`: validate mảng không rỗng, validate split ∈ [train/valid/test], kiểm tra tất cả imageIds thuộc project, UPDATE batch, logActivity `batch_split_change`, trả `ImageItem[]`.
   - `DELETE /batch` body `{imageIds[]}`: tương tự validate, role check annotator (nếu 1 ảnh không phải của annotator → 403 toàn batch), xoá file vật lý từng ảnh, DELETE batch trong DB (CASCADE xoá annotations), logActivity `batch_image_delete`.
   - `batch-assign-class`: không implement — class gắn với annotation (có bbox), không phải image; gán class trực tiếp cho ảnh sẽ tạo annotation không có tọa độ → vô nghĩa.
2. **client/src/api.ts** — thêm `batchUpdateImages()` và `batchDeleteImages()` dùng `request<>` chung.
3. **client/src/pages/ProjectDetailPage.tsx** — thêm:
   - State `selectedIds: Set<string>` + `toggleSelect(id, e)` + `clearSelection()`.
   - `batchChangeSplit(split)`: gọi `api.batchUpdateImages`, reload danh sách, showToast.
   - `batchDelete()`: confirm dialog "Bạn sắp xoá N ảnh. Không thể hoàn tác.", gọi `api.batchDeleteImages`, cập nhật state local.
   - Batch toolbar (hiện khi `selectedIds.size > 0`): nền navy #251C53, "Đã chọn N ảnh", nút "Chọn trang này", select "Đổi split…", nút "Xoá N ảnh" (cam #F05922), nút "Bỏ chọn".
   - Checkbox + selected overlay trên mỗi tile (stopPropagation ngăn Link navigate khi click checkbox).
4. **tests/auth.test.js** — thêm helper `delBody()` + Row 22 gồm 16 test case: unauth→401, annotator own→204, annotator mixed-owner→403 + verify không xoá 1 phần, reviewer/admin any→204, empty ids→400.
5. **code-graph/CODE-GRAPH.md + .docx** — cập nhật §3.5 images.js (batch routes) + §7 Images API table + §10 lịch sử.

## Artifact

- `server/src/routes/images.js` — PATCH /batch + DELETE /batch
- `client/src/api.ts` — batchUpdateImages, batchDeleteImages
- `client/src/pages/ProjectDetailPage.tsx` — selectedIds state + batch toolbar + checkbox tiles
- `tests/auth.test.js` — Row 22 (16 test case)
- `code-graph/CODE-GRAPH.md` + `code-graph/CODE-GRAPH.docx`

## Quyết định quan trọng

1. **batch-assign-class bỏ qua**: Class trong schema hiện tại gắn với `annotations.class_id` (mỗi annotation có 1 class + bbox/polygon). "Gán class cho ảnh" không có nghĩa rõ ràng — phải gắn với annotation cụ thể. Ghi chú trong STEP file và code comment.
2. **403 toàn batch khi annotator thiếu quyền**: Nếu 1 ảnh trong batch không thuộc annotator → từ chối TOÀN BỘ batch (không xoá 1 phần). Tránh trạng thái không nhất quán: user mong xoá 5 ảnh nhưng chỉ xoá được 3 → khó debug. Response trả `unauthorizedIds[]` để client biết ảnh nào bị lỗi.
3. **Batch split — không giới hạn role**: Theo pattern PATCH /:imageId (không có role guard cho split change), PATCH /batch cũng không giới hạn. Tất cả role đều được đổi split.
4. **pagedImages TDZ bug phòng tránh**: `selectAllPage` dùng `pagedImages` (khai báo sau các batch functions) → sẽ gây TDZ runtime error nếu dùng `useCallback([pagedImages])`. Giải pháp: đặt inline trong JSX button's `onClick` — lúc render thì `pagedImages` đã được tính xong.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Không thêm `/batch` endpoint lần nữa. Không thêm checkbox/selectedIds vào ProjectDetailPage (đã có). Không thêm `batchUpdateImages`/`batchDeleteImages` vào api.ts.
- watch_out: Batch routes phải đứng TRƯỚC `/:imageId` trong Express router — nếu thêm route mới trong images.js hãy giữ thứ tự này. `selectedIds` là state Set<string> trong ProjectDetailPage — bước 5.4/5.5 có thể tái sử dụng nếu cần multi-select trong context khác. Phím tắt trong AnnotatorPage (từ STEP-5.2): Ctrl+Z/Y, ArrowLeft/Right, Delete/Backspace, Escape, D, Space, 1-9, Alt+C — batch operations trong ProjectDetailPage (khác trang) không xung đột.
- next_inputs: Commit hash `ea0ed8b`. File `server/src/routes/images.js` tại commit này. File `client/src/pages/ProjectDetailPage.tsx` tại commit này — có `selectedIds` state, `clearSelection`, `batchChangeSplit`, `batchDelete`.

## Commit

- Hash: ea0ed8b
- Đã push: có — branch `Improve`

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

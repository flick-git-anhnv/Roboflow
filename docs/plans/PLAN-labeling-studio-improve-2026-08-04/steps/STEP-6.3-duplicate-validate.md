---
step: "6.3"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: done
completed_at: 2026-08-05 05:08
deps: ["0.2"]
---

# STEP 6.3 — Duplicate detection + Dataset validation

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD + API contracts. Đọc handoff 0.2 trước khi code.

## Nhiệm vụ

Kiểm tra chất lượng dataset: (1) phát hiện ảnh trùng (hash-based), (2) validate annotation lỗi (bbox ngoài ảnh, polygon thiếu điểm, class_id không tồn tại), (3) báo cáo class không được dùng.

## Definition of Done

- [ ] `GET /api/projects/:id/validate` trả:
  - `duplicates: [{image_id, duplicate_of, filename}]` — so sánh MD5/SHA hash
  - `invalid_annotations: [{annotation_id, image_id, reason: "bbox_out_of_bounds"|"polygon_too_few_points"|"invalid_class"}]`
  - `unused_classes: [{class_id, name}]`
- [ ] `client/src/pages/ProjectDetailPage.tsx` — nút "Validate Dataset", kết quả với badge đếm issues; click issue → navigate đến ảnh/annotation tương ứng
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: upload 2 ảnh giống nhau → duplicate detected; annotation bbox x2 > image width → invalid hiện đúng
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

- Tạo `server/src/routes/validate.js`: GET /api/projects/:projectId/validate — tính MD5 hash mỗi file ảnh, group duplicate, query annotation lỗi tọa độ, query class không dùng
- Mount validateRouter trong `server/src/index.js` tại `/api/projects/:projectId`
- Thêm types `ValidateResult`, `ValidateDuplicate`, `ValidateInvalidAnnotation`, `ValidateUnusedClass` vào `client/src/types.ts`
- Thêm `api.validateDataset()` vào `client/src/api.ts`
- Tạo `client/src/components/ValidateModal.tsx`: modal 3 nhóm kết quả, click navigate đến AnnotatorPage
- Thêm nút "Kiểm tra dataset" + state `validateOpen` vào `client/src/pages/ProjectDetailPage.tsx`
- Thêm Row 24 (18 test case) vào `tests/auth.test.js`
- Cập nhật `code-graph/CODE-GRAPH.md` §3.17 + §3.1 + lịch sử

## Artifact

- `server/src/routes/validate.js` (MỚI)
- `client/src/components/ValidateModal.tsx` (MỚI)
- `server/src/index.js` (sửa — mount validate route)
- `client/src/api.ts` (sửa — validateDataset)
- `client/src/types.ts` (sửa — ValidateResult types)
- `client/src/pages/ProjectDetailPage.tsx` (sửa — nút + modal)
- `tests/auth.test.js` (sửa — Row 24)
- `code-graph/CODE-GRAPH.md` (sửa — §3.17 mới)

## Quyết định quan trọng

- Hash MD5 tính at request time bằng `crypto.createHash('md5')` đọc file vật lý — không lưu vào DB (đơn giản, đủ dùng cho dataset size bình thường; nếu project lớn có thể cache sau)
- Role: tất cả role đã login đều xem được (giống pattern GET resources — Row 1)
- Response format dùng camelCase (`imageIds`, `invalidAnnotations`, `unusedClasses`) để nhất quán với API hiện có
- TINY_PNG test image (1×1 pixel): annotation `x=0, y=0, w=5, h=5` → `x+w=5 > width=1` → lỗi tọa độ được detect đúng

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Đây là bước CUỐI cùng của toàn bộ plan 23 bước. Không còn bước nào cần thực hiện tiếp. Toàn bộ Phase 1-6 đã DONE (bước 6.2 Skipped theo quyết định user).
- watch_out: Không có bước kế tiếp — plan hoàn thành.
- next_inputs: Không có — plan đã kết thúc. Tổng kết: 193 test pass, tsc 0 lỗi, đã push lên nhánh Improve.

## Commit

- Hash: a5903d8
- Đã push: có (branch Improve → origin)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

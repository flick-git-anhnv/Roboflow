---
step: "6.3"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: todo
completed_at:
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

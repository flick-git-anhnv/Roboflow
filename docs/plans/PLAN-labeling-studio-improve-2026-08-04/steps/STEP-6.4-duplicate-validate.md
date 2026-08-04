> **SUPERSEDED — xem STEP-6.3-duplicate-validate.md (đánh số lại sau khi bỏ SAM)**

---
step: "6.4-SUPERSEDED"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: todo
completed_at:
deps: ["0.2"]
---

# STEP 6.4 — Duplicate detection & Dataset validation

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD + API contracts. Không phụ thuộc phase khác. Đọc handoff 0.2 trước khi code.

## Nhiệm vụ

Thêm tính năng kiểm tra chất lượng dataset: (1) phát hiện ảnh trùng lặp (hash-based), (2) validate annotation lỗi (tọa độ bbox ngoài ảnh, polygon thiếu điểm, class_id không tồn tại trong project), (3) báo cáo class không được dùng trong project.

## Definition of Done

- [ ] `server/src/routes/stats.js` (hoặc route mới) — endpoint `GET /api/projects/:id/validate` trả:
  - `duplicates: [{image_id, duplicate_of: image_id, filename}]` — so sánh MD5/SHA hash file
  - `invalid_annotations: [{annotation_id, image_id, reason: "bbox_out_of_bounds"|"polygon_too_few_points"|"invalid_class"}]`
  - `unused_classes: [{class_id, name}]` — class không có annotation nào dùng
- [ ] Validate chạy async (job hoặc sync nếu dataset nhỏ < 1000 ảnh)
- [ ] `client/src/pages/ProjectDetailPage.tsx` — nút "Validate Dataset", hiển thị kết quả validation với badge đếm issues theo loại
- [ ] Click issue → navigate đến ảnh/annotation có vấn đề
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: upload 2 ảnh giống nhau → duplicate detected; tạo annotation với bbox x2 > image width → invalid_annotations hiện đúng
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

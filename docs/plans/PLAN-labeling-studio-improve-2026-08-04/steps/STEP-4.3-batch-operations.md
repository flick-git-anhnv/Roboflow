> **SUPERSEDED — xem STEP-5.3-batch-operations.md (đã đánh số lại Phase 5)**

---
step: "4.3-SUPERSEDED"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: todo
completed_at:
deps: ["0.2"]
---

# STEP 4.3 — Batch operations trên ảnh

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD + API contracts. Không phụ thuộc phase khác về mặt code. Đọc handoff 0.2 trước khi code.

## Nhiệm vụ

Thêm batch operations trong ProjectDetailPage: người dùng chọn nhiều ảnh (checkbox), rồi thực hiện hành loạt: (1) gán class cho tất cả (dùng với auto-label đã chạy, chỉnh class đồng loạt), (2) đổi split (train/val/test) hàng loạt, (3) xoá nhiều ảnh cùng lúc.

## Definition of Done

- [ ] `server/src/routes/images.js` — 3 endpoints batch:
  - `PATCH /api/images/batch/split` body `{imageIds: [], split: "train"|"val"|"test"}`
  - `DELETE /api/images/batch` body `{imageIds: []}`
  - `PATCH /api/images/batch/class` body `{imageIds: [], classId: N}` (gán class mặc định cho ảnh, không phải annotation — làm rõ trong TDD)
- [ ] `client/src/pages/ProjectDetailPage.tsx` — checkbox "select all" + từng ảnh; toolbar batch actions hiện ra khi có ảnh được chọn
- [ ] Confirm dialog trước khi xoá batch ("Bạn sắp xoá X ảnh. Không thể hoàn tác.")
- [ ] Sau batch delete → activity_log ghi 1 event `image_delete_batch` (nếu bước 3.3 đã done, nếu chưa thì skip)
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: chọn 5 ảnh, đổi split → verify DB; chọn 3 ảnh, xoá → verify xoá đúng, project còn lại đúng số ảnh
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

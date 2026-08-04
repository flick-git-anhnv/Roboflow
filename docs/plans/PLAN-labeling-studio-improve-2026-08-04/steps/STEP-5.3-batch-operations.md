---
step: "5.3"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: todo
completed_at:
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

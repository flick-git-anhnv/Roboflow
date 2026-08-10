> **SUPERSEDED — xem STEP-5.2-copy-labels.md (đã đánh số lại Phase 5)**

---
step: "4.2-SUPERSEDED"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: todo
completed_at:
deps: ["1.1"]
---

# STEP 4.2 — Copy nhãn từ ảnh trước sang ảnh hiện tại

## Input nhận

Từ STEP-1.1 Handoff Payload: inference service đang hoạt động. Không phụ thuộc trực tiếp vào 1.1 về mặt code, nhưng cần server ổn định để test. Đọc handoff 1.1 trước khi code.

## Nhiệm vụ

Thêm tính năng copy nhãn (annotations) từ ảnh trước trong danh sách sang ảnh hiện tại đang xem. Hữu ích khi label chuỗi ảnh liên tiếp từ camera tĩnh (nền không đổi, đối tượng dịch chuyển ít). Phím tắt: Alt+C hoặc button "Copy từ ảnh trước".

## Definition of Done

- [ ] `server/src/routes/annotations.js` — endpoint `GET /api/images/:id/prev-annotations` trả annotations của ảnh ngay trước trong project (theo thứ tự upload/id), hoặc `null` nếu là ảnh đầu tiên
- [ ] `client/src/pages/AnnotatorPage.tsx` — nút "Copy từ ảnh trước" (Alt+C) gọi API, load annotations vào canvas dưới dạng trạng thái chờ confirm (tương tự prefill 2.2 — chưa save tự động)
- [ ] Nếu ảnh hiện tại đã có annotation → hiện confirm dialog "Ảnh này đã có nhãn. Ghi đè?" trước khi copy
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: label ảnh A, chuyển sang ảnh B (chưa label), nhấn Alt+C → annotations của A hiện lên; save → verify DB chứa annotations của B (không sửa ảnh A)
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

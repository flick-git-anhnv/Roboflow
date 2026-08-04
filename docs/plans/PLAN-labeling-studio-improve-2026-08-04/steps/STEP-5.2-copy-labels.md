---
step: "5.2"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: todo
completed_at:
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

---
step: "3.2"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["3.1"]
---

# STEP 3.2 — Annotation history + audit trail

## Input nhận

Từ STEP-3.1 Handoff Payload: migration 003-005 đã chạy xong, bảng `annotation_history` và cột `version` trên `annotations` đã có. Đọc handoff 3.1 trước khi code.

## Nhiệm vụ

Implement logic lưu annotation history: mỗi khi annotations của 1 ảnh được save (PUT/PATCH), hệ thống tự động snapshot `data_before` + `data_after` vào bảng `annotation_history`, tăng `version` trên bảng `annotations`. Thêm API đọc lịch sử để UI hiển thị.

## Definition of Done

- [ ] `server/src/routes/annotations.js` — save annotation tự động ghi row vào `annotation_history` (trong 1 transaction)
- [ ] `version` trên bảng `annotations` tăng +1 mỗi lần save thành công
- [ ] `GET /api/images/:id/history` — trả danh sách history entries (version, changed_at, actor nếu có)
- [ ] `GET /api/images/:id/history/:version` — trả `data_before` + `data_after` của version cụ thể
- [ ] `client/src/pages/AnnotatorPage.tsx` — icon "History" mở panel xem danh sách các version đã lưu
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: save annotation 3 lần cho 1 ảnh, verify có 3 history entry, xem lại từng version đúng nội dung
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

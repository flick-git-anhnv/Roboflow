---
step: "4.2"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["1.1", "4.1"]
---

# STEP 4.2 — Prefill bbox tự động khi mở ảnh chưa label

## Input nhận

Từ STEP-4.1 Handoff Payload: detect cache đã hoạt động. Đọc handoff 4.1 trước khi code.

## Nhiệm vụ

Khi người dùng mở ảnh chưa có annotation nào, client tự gọi detect để gợi ý bbox trước — hiển thị dưới dạng annotation nháp (style khác biệt). Người dùng accept/reject/sửa từng box, không save tự động. Backend dùng detect cache (4.1) nếu có.

## Definition of Done

- [ ] `GET /api/images/:id/suggestions` — trả kết quả detect (dùng cache 4.1 nếu có, nếu không thì detect mới qua inference service)
- [ ] `client/src/pages/AnnotatorPage.tsx` — khi ảnh mở và `annotations.length === 0`, tự gọi `/suggestions`
- [ ] Suggestions hiển thị trên canvas với style khác (đường kẻ đứt, màu xám/vàng)
- [ ] UI: nút "Accept All", "Reject All", click từng box để accept/reject riêng
- [ ] Suggestions KHÔNG được save vào DB cho đến khi user accept
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: mở ảnh chưa label với model đang có → suggestions hiện; accept 1 box, save → chỉ box đó được lưu
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

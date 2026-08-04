> **SUPERSEDED — xem STEP-4.2-prefill-bbox.md (đã đánh số lại Phase 4)**

---
step: "2.2-SUPERSEDED"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["1.1", "2.1"]
---

# STEP 2.2 — Prefill bbox tự động khi mở ảnh chưa label

## Input nhận

Từ STEP-2.1 Handoff Payload: detect cache đã hoạt động. Đọc handoff 2.1 trước khi code.

## Nhiệm vụ

Khi người dùng mở ảnh chưa có annotation nào (hoặc chưa bao giờ label), client tự động gọi detect để "gợi ý" bbox trước — hiển thị dưới dạng annotation nháp (màu khác, có icon "gợi ý") để người dùng accept/reject/sửa từng box, không save tự động. Backend: detect nền ngay khi ảnh được load (tận dụng detect cache 2.1). Frontend: hiển thị annotation gợi ý chờ confirm.

## Definition of Done

- [ ] `server/src/routes/images.js` — endpoint `GET /api/images/:id/suggestions` trả kết quả detect (dùng cache 2.1 nếu có, nếu không thì detect mới)
- [ ] `client/src/pages/AnnotatorPage.tsx` — khi ảnh mở và `annotations.length === 0`, tự gọi `/suggestions`
- [ ] Suggestions hiển thị trên canvas với style khác (ví dụ: đường kẻ đứt, màu xám/vàng thay vì màu đặc)
- [ ] UI: nút "Accept All" (chuyển tất cả suggestion thành annotation thật), "Reject All", và click từng box để accept/reject riêng
- [ ] Suggestions KHÔNG được save vào DB cho đến khi user accept
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7 trước QA
- [ ] TL review + approve PR
- [ ] QA smoke test: mở ảnh chưa label với model đang có, verify suggestions hiện lên; accept một box, save, verify chỉ box đó được lưu
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

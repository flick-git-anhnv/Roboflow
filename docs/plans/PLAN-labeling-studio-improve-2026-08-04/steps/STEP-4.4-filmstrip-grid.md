> **SUPERSEDED — xem STEP-5.4-filmstrip-grid.md (đã đánh số lại Phase 5)**

---
step: "4.4-SUPERSEDED"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["1.3"]
---

# STEP 4.4 — Filmstrip/grid xem nhanh nhiều ảnh

## Input nhận

Từ STEP-1.3 Handoff Payload: thumbnail service đang hoạt động tại `GET /api/images/:id/thumb`. Đọc handoff 1.3 trước khi code.

## Nhiệm vụ

Thêm chế độ grid/filmstrip cho ProjectDetailPage: hiển thị thumbnails nhiều ảnh cùng lúc (4/6/8 cột, chọn được), load thumbnail async theo batch (lazy loading khi scroll). Filmstrip ở AnnotatorPage: dải thumbnail ngang phía dưới canvas, click chuyển ảnh nhanh. Thumbnails dùng endpoint `/api/images/:id/thumb` từ bước 1.3.

## Definition of Done

- [ ] `client/src/pages/ProjectDetailPage.tsx` — toggle chế độ "list" / "grid"; grid hiển thị thumbnails với overlay badge (split, annotated/not, class count)
- [ ] Grid lazy-load thumbnail: IntersectionObserver hoặc react-window — không load tất cả cùng lúc
- [ ] `client/src/pages/AnnotatorPage.tsx` — filmstrip ngang dưới canvas (max 10 thumb visible, scroll horizontal), thumb hiện tại được highlight
- [ ] Click thumb trong filmstrip → navigate sang ảnh đó
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7 (đặc biệt C5 — performance grid 100+ ảnh)
- [ ] TL review + approve PR
- [ ] QA smoke test: project 50 ảnh, bật grid → verify chỉ thumb visible load (Network tab), scroll → load thêm; filmstrip chuyển ảnh đúng
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

---
step: "5.4"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["1.3"]
---

# STEP 5.4 — Filmstrip/grid xem nhanh nhiều ảnh

## Input nhận

Từ STEP-1.3 Handoff Payload: thumbnail service tại `GET /api/images/:id/thumb` đang hoạt động. Đọc handoff 1.3 trước khi code.

## Nhiệm vụ

Thêm chế độ grid/filmstrip: ProjectDetailPage hiển thị thumbnails nhiều ảnh (lazy load theo batch). Filmstrip ngang dưới canvas của AnnotatorPage. Thumbnails hiển thị badge trạng thái (unlabeled/labeled/done/in-review/approved) theo màu sắc khác nhau.

## Definition of Done

- [ ] `client/src/pages/ProjectDetailPage.tsx` — toggle "list" / "grid"; grid thumbnails với badge trạng thái (dùng `completed_at` từ 3.5 và `review_status` từ 2.3 nếu đã có, fallback graceful nếu chưa)
- [ ] Grid lazy-load: IntersectionObserver — không load tất cả cùng lúc
- [ ] `client/src/pages/AnnotatorPage.tsx` — filmstrip ngang dưới canvas (max 10 thumb visible, scroll horizontal), thumb hiện tại highlight
- [ ] Click thumb filmstrip → navigate sang ảnh đó
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7 (performance grid 100+ ảnh)
- [ ] TL review + approve PR
- [ ] QA smoke test: project 50 ảnh, bật grid → chỉ thumb visible load (Network tab); filmstrip chuyển ảnh đúng
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

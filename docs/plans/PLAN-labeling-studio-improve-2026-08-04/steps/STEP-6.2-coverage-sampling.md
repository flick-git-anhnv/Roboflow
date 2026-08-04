---
step: "6.2"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["0.2"]
---

# STEP 6.2 — Coverage-based sampling khi thu thập ảnh

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD. Đọc handoff 0.2 trước khi code.

Ghi chú: feature tham khảo "Time-Rotating Sampling" từ tool cũ. Cần làm rõ scope với user trước khi implement (mode a/b/c — xem DoD bên dưới).

## Nhiệm vụ

Khi import nhiều ảnh vào project, cho phép user chọn sampling strategy để tự động lọc subset thay vì import tất cả — đảm bảo dataset đa dạng theo thời gian/cảnh quan.

## Definition of Done

- [ ] **Làm rõ scope** với user: (a) upload theo lịch từ camera, (b) khi import folder lớn thì sample subset, hay (c) chỉ gợi ý UI — ghi quyết định vào "Quyết định quan trọng" trước khi code
- [ ] `POST /api/projects/:id/import-sampled` nhận `{folderPath, maxImages, strategy: "uniform"|"time-bucket"}`, chọn subset → import (nếu chọn mode b)
- [ ] UI: form cấu hình sampling khi import nhiều ảnh
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: import 200 ảnh, strategy "uniform max 50" → verify chỉ 50 ảnh được import
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

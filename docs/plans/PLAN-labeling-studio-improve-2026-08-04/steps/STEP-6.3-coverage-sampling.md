> **SUPERSEDED — xem STEP-6.2-coverage-sampling.md (đánh số lại sau khi bỏ SAM)**

---
step: "6.3-SUPERSEDED"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["0.2"]
---

# STEP 6.3 — Coverage-based sampling khi thu thập ảnh

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD. Không phụ thuộc phase khác về code. Đọc handoff 0.2 trước khi code.

Ghi chú: feature này tham khảo "Time-Rotating Sampling" từ tool cũ — ý tưởng là khi thu thập ảnh từ camera/video, không lấy mỗi frame mà lấy theo lịch trình phủ thời gian (sáng/chiều/tối, thời tiết khác nhau) để dataset đa dạng hơn. Cần làm rõ với user scope chính xác trước khi implement.

## Definition of Done

- [ ] Làm rõ scope với user (hoặc ghi chú trong step file): tính năng nhắm vào (a) upload theo lịch tự động từ camera, hay (b) khi upload folder lớn thì sample theo coverage logic, hay (c) chỉ gợi ý user nên thu thập ảnh khi nào — chọn 1 mode để implement
- [ ] (Nếu chọn mode b — upload folder sampling): endpoint `POST /api/projects/:id/import-sampled` nhận folder path + sampling config `{maxImages, strategy: "uniform"|"time-bucket"}`, chọn subset ảnh theo strategy rồi import
- [ ] UI: form cấu hình sampling khi import nhiều ảnh (chọn strategy + params)
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: import 200 ảnh với strategy "uniform, max 50" → verify chỉ 50 ảnh được import và phân bổ đều
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

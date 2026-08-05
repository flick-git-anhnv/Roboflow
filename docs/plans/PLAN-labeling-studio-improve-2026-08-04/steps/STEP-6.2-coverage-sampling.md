---
step: "6.2"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: skipped
completed_at: "2026-08-05 11:56"
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

Đã hỏi user làm rõ scope (theo đúng yêu cầu DoD) với 3 phương án: (a) sample subset khi upload folder/zip lớn, (b) chỉ gợi ý UI không tự lọc, (c) bỏ qua bước này vì không phù hợp kiến trúc hiện tại. **User chọn phương án (c) — bỏ qua.**

## Artifact

Không có (bước bị skip trước khi code).

## Quyết định quan trọng

**Bỏ qua bước 6.2 theo quyết định của user.** Lý do nêu ra khi hỏi: bản server hiện tại (KZTEK Labeling Studio) chỉ có upload file/folder/zip từ trình duyệt — hoàn toàn KHÔNG có tích hợp thu thập ảnh tự động từ camera/API như tool cũ (D:\Tool có 3 worker riêng: LotteImage, Parkingv8, Parkingv6, dùng thuật toán "Time-Rotating Sampling"). Áp dụng coverage sampling cho luồng upload thủ công hiện tại không mang lại giá trị tương đương — user quyết định không cần tính năng này ở đợt cải tiến này.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Không cần implement `POST /api/projects/:id/import-sampled` hay bất kỳ UI sampling nào — bước này đã bị skip có chủ đích, không phải bỏ sót.
- watch_out: Nếu sau này project có tính năng thu thập ảnh tự động từ camera/API (ngoài scope hiện tại), có thể mở lại ý tưởng "Time-Rotating Sampling" từ tool cũ (`D:\Tool\tool\features\collection\event_planner.py`).
- next_inputs: Không có — bước 6.3 (duplicate/validate dataset) độc lập, không phụ thuộc bước này.

## Commit

- Hash: Không có (không code, chỉ cập nhật plan — sẽ commit cùng lúc với việc cập nhật PLAN-MASTER)
- Đã push: sẽ push cùng lần commit tiếp theo

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

> **SUPERSEDED — xem STEP-6.1-model-versioning.md (đánh số lại sau khi bỏ SAM)**

---
step: "6.2-SUPERSEDED"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: todo
completed_at:
deps: ["0.2"]
---

# STEP 6.2 — Model versioning + metadata so sánh hiệu năng

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD + API contracts. Không phụ thuộc phase khác về mặt code. Đọc handoff 0.2 trước khi code.

## Nhiệm vụ

Mở rộng tính năng quản lý model: thêm metadata vào bảng `models` hiện có (ngày train, dataset dùng để train, mAP@50, mAP@50-95, số epoch, notes) và UI so sánh hiệu năng giữa các model.

## Definition of Done

- [ ] Migration `server/migrations/008_extend_models_metadata.sql` — thêm các cột metadata vào bảng `models` hiện có: `train_date, dataset_version, map50, map50_95, epochs, notes`
- [ ] `server/src/routes/models.js` — update PUT/PATCH để nhận và lưu các trường metadata mới
- [ ] `client/src/pages/ProjectDetailPage.tsx` (hoặc trang riêng) — form nhập metadata khi upload/edit model
- [ ] `client/src/` — bảng so sánh hiệu năng model (sort theo mAP50, hiển thị badge "best model")
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: thêm 3 model với metadata khác nhau, verify bảng so sánh sort đúng
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

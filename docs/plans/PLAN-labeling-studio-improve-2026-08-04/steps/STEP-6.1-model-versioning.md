---
step: "6.1"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: todo
completed_at:
deps: ["0.2"]
---

# STEP 6.1 — Model versioning + metadata so sánh hiệu năng

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD + API contracts. Đọc handoff 0.2 trước khi code.

## Nhiệm vụ

Mở rộng bảng `models` hiện có: thêm metadata (ngày train, dataset dùng để train, mAP@50, mAP@50-95, số epoch, notes) và UI so sánh hiệu năng giữa các model.

## Definition of Done

- [ ] Migration `server/migrations/008_extend_models_metadata.sql` — thêm cột `train_date, dataset_version, map50, map50_95, epochs, notes` vào bảng `models`
- [ ] `server/src/routes/models.js` — PUT/PATCH cập nhật để nhận và lưu các trường metadata mới
- [ ] `client/src/` — form nhập metadata khi upload/edit model; bảng so sánh hiệu năng (sort theo mAP50, badge "best model")
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

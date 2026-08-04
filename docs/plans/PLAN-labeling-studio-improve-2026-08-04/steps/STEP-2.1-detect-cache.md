> **SUPERSEDED — xem STEP-4.1-detect-cache.md (đã đánh số lại Phase 4)**

---
step: "2.1-SUPERSEDED"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["1.1"]
---

# STEP 2.1 — Cache kết quả detect theo ảnh (persist)

## Input nhận

Từ STEP-1.1 Handoff Payload: inference service FastAPI đang chạy tại `localhost:8001`, autolabel.js đã refactor gọi HTTP. Đọc handoff của 1.1 trước khi code bước này.

## Nhiệm vụ

Tạo detect cache persist (tương tự `detect_cache.py` của tool cũ): sau khi inference service trả kết quả cho 1 ảnh, cache kết quả (boxes/labels/scores theo model_path + conf + iou) vào bảng `detect_cache` trong DB. Lần gọi tiếp theo cho cùng ảnh + cùng model + cùng conf/iou → lấy từ cache, không gọi inference service lại. Cache bị invalidate khi ảnh bị xoá hoặc model thay đổi.

## Definition of Done

- [ ] Migration SQL `server/migrations/002_create_detect_cache.sql` — bảng `detect_cache(id, image_id, model_path, conf, iou, result_json, created_at)`
- [ ] Index trên `(image_id, model_path, conf, iou)` để lookup nhanh
- [ ] `server/src/routes/autolabel.js` — kiểm tra cache trước khi gọi inference, lưu cache sau khi nhận kết quả
- [ ] API endpoint `DELETE /api/detect-cache?imageId=` (xoá cache cho 1 ảnh khi cần refresh)
- [ ] Cache tự invalidate khi ảnh bị xoá (ON DELETE CASCADE qua image_id FK)
- [ ] TL review + approve PR
- [ ] QA smoke test: detect 1 ảnh 2 lần, lần 2 phải nhanh hơn đáng kể và không gọi inference service (log/verify)
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

---
step: "4.1"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["1.1"]
---

# STEP 4.1 — Cache kết quả detect theo ảnh (persist)

## Input nhận

Từ STEP-1.1 Handoff Payload: inference service FastAPI đang chạy tại `localhost:8001`, `autolabel.js` đã refactor gọi HTTP. Đọc handoff 1.1 trước khi code.

## Nhiệm vụ

Tạo detect cache persist: sau khi inference service trả kết quả cho 1 ảnh, cache kết quả (boxes/labels/scores theo `model_path + conf + iou`) vào bảng `detect_cache` trong DB. Lần gọi tiếp theo cho cùng ảnh + cùng tham số → lấy từ cache, không gọi inference lại. Cache invalidate khi ảnh bị xoá.

## Definition of Done

- [ ] Migration `server/migrations/002_create_detect_cache.sql` — bảng `detect_cache(id, image_id, model_path, conf, iou, result_json, created_at)` với index trên `(image_id, model_path, conf, iou)`
- [ ] `server/src/routes/autolabel.js` — kiểm tra cache trước khi gọi inference; lưu cache sau khi nhận kết quả
- [ ] `DELETE /api/detect-cache?imageId=` (xoá cache cho 1 ảnh khi cần refresh)
- [ ] Cache tự invalidate khi ảnh bị xoá (ON DELETE CASCADE qua FK image_id)
- [ ] TL review + approve PR
- [ ] QA smoke test: detect 1 ảnh 2 lần, lần 2 phải nhanh hơn đáng kể và không gọi inference service (verify qua log/timing)
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

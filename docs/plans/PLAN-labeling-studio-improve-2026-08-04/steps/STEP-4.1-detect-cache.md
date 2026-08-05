---
step: "4.1"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: "2026-08-05 10:33"
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

1. Migration `m007_detect_cache()` trong `server/src/db.js` (pattern idempotent `mNNN_xxx()`, verify row count trước/sau — CREATE TABLE mới nên không có rủi ro mất dữ liệu existing).
2. Bảng `detect_cache(id, image_id FK→images CASCADE, model_id FK→models CASCADE, raw_detections TEXT JSON, created_at)` + UNIQUE index `(image_id, model_id)` + 2 index phụ.
3. `server/src/routes/autolabel.js` — cache RAW detections (không áp threshold) tại `CACHE_RAW_CONF=0.01`, tách batch thành `hits`/`misses`: hit → đọc `raw_detections` từ cache, áp `filterRawBoxesByConf(conf)` ở tầng application; miss → gọi inference service với conf thấp (0.01) để lấy đủ box, lưu cache (`saveToCacheDetections`, UPSERT), rồi filter theo conf thật của user.
4. `server/src/python/inference_service.py` — mỗi box trả thêm field `conf` (bbox: `r.boxes.conf[i]`, OBB: `obb.conf[i]`) để Node lưu đúng confidence gốc vào cache.
5. `DELETE /api/projects/:projectId/auto-label/cache?imageId=&modelId=` — xoá cache theo project (kèm filter tuỳ chọn), dùng khi cần force re-detect.
6. Test: 5 case mới (Row 20) cho endpoint DELETE cache (401/200/404).

**Test:** `node tests/auth.test.js` → 133 passed, 0 failed, 0 skipped (từ 128).

## Artifact

- `server/src/db.js` (sửa — `m007_detect_cache()`)
- `server/src/routes/autolabel.js` (sửa — cache logic + DELETE endpoint)
- `server/src/python/inference_service.py` (sửa — trả `conf`)
- `tests/auth.test.js` (sửa — Row 20)
- `code-graph/CODE-GRAPH.md` + `.docx` (sửa)

## Quyết định quan trọng

1. **Cache RAW (unfiltered) thay vì cache theo `(image_id, model_path, conf, iou)`** như draft DoD ban đầu — thay vào đó cache 1 entry/`(image_id, model_id)` ở `CACHE_RAW_CONF=0.01` (gần như lấy hết box model detect được), rồi filter theo conf THẬT của user ở tầng application. Lý do: đây chính là mục tiêu ADR nêu ("đổi conf/IoU threshold KHÔNG cần detect lại") — nếu cache theo từng tổ hợp conf/iou như draft DoD, đổi threshold vẫn phải detect lại (cache miss), không đạt được mục tiêu tối ưu tốc độ.
2. **IoU không đổi được từ cache** — NMS áp dụng tại inference service (mặc định 0.45), cache chỉ lưu kết quả sau NMS. Nếu cần đổi IoU thực sự phải xoá cache + detect lại (dùng `DELETE /cache`).
3. **UPSERT (INSERT OR REPLACE)** khi lưu cache — detect lại cùng ảnh+model (VD: model update) tự động ghi đè cache cũ, không cần xoá thủ công trước.
4. **`server/migrations/002_*.sql` không tạo** — tiếp tục pattern `mNNN_xxx()` trong `db.js` nhất quán từ STEP-1.2 trở đi (không dùng file `.sql` riêng làm nguồn migration thật).

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Bảng `detect_cache` đã tồn tại, KHÔNG tạo lại. Hàm `getCachedDetections(imageId, modelId)`, `saveToCacheDetections()`, `filterRawBoxesByConf(boxes, conf)` đã có sẵn trong `autolabel.js` — STEP-4.2 import/tái sử dụng, không viết lại.
- watch_out: Cache key là `(image_id, model_id)` — STEP-4.2 (prefill bbox khi mở ảnh) cần biết model_id nào đang "active" cho project đó (chưa có khái niệm "default model" rõ ràng trong hệ thống — cần tự quyết định lấy model nào, ví dụ model mới nhất đã upload, hoặc yêu cầu user chọn trước). Nếu cache miss khi mở ảnh, STEP-4.2 tự quyết định: gọi inference ngầm (tốn thời gian, UX chờ) hoặc chỉ hiển thị gợi ý khi đã có cache sẵn.
- next_inputs: `CACHE_RAW_CONF=0.01` (constant trong `autolabel.js`) — dùng đúng giá trị này khi gọi inference để giữ nhất quán với cache đã lưu. `filterRawBoxesByConf` nhận `(boxes, conf)` trả về mảng đã lọc theo `conf` threshold thật của user.

## Commit

- Hash: 2efad59
- Đã push: có
- Đã push: [có/không]

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

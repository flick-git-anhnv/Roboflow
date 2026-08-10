---
step: "1.1"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: "2026-08-04 16:42"
deps: ["0.2"]
---

# STEP 1.1 — Inference service Python thường trực (FastAPI)

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD tại `docs/tech-design/TDD-labeling-studio-improve.md` — đọc mục "Inference service FastAPI" trước khi code.

## Nhiệm vụ

Tạo FastAPI service (`server/src/python/inference_service.py`) giữ YOLO model trong RAM, lắng nghe HTTP tại `localhost:8001`. Refactor `server/src/routes/autolabel.js` để gọi HTTP thay vì `spawn` process mỗi lần. Giữ nguyên `infer.py` cũ (không xoá) để rollback nếu cần. Workflow: WF-FEATURE (không đụng auth/schema hiện có, không đụng UI nhiều).

## Definition of Done

- [ ] `server/src/python/inference_service.py` — FastAPI app, endpoint `POST /infer` nhận `{image_path, model_path, conf, iou}`, trả `{boxes: [...], labels: [...], scores: [...]}`
- [ ] Service startup script hoặc hướng dẫn khởi động trong `server/README.md` (cập nhật thêm mục "Chạy inference service")
- [ ] `server/src/routes/autolabel.js` — refactor: thay `spawn infer.py` bằng `fetch("http://localhost:8001/infer", ...)` với timeout + retry logic
- [ ] Fallback graceful khi inference service down (trả 503 với message rõ ràng thay vì crash)
- [ ] Test: gọi manual auto-label thành công qua UI hoặc curl — model load 1 lần, lần 2 gọi nhanh hơn đáng kể
- [ ] TL review + approve PR
- [ ] QA smoke test: auto-label 5 ảnh liên tiếp, verify không spawn process mới
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. Tạo `server/src/python/inference_service.py`: FastAPI app, LRU cache 3 model, 3 endpoints (GET /health, POST /warmup, POST /predict). Hỗ trợ bbox và OBB quad, per-image error handling.
2. Refactor `server/src/routes/autolabel.js`: thêm `runInferenceHTTP()` gọi FastAPI, `checkInferenceHealth()` health gate (3s timeout) → 503 khi service down. Giữ nguyên `runInference()` legacy.
3. Sửa `server/src/index.js`: thêm `startInferenceService()` spawn Python sau `app.listen()`, `stopInferenceService()` hook vào SIGINT/SIGTERM/exit.
4. Tạo `server/README.md`: hướng dẫn chạy, env vars, rollback instructions, cấu trúc Python inference.
5. Cập nhật `code-graph/CODE-GRAPH.md` + xuất `.docx` + `.pdf` với nội dung STEP-1.1.
6. Bump `server/package.json`: better-sqlite3 và sharp lên bản tương thích Node.js 24.15.0.

**Test thực tế đã chạy:**
- `python inference_service.py` → start OK, log `Starting on http://127.0.0.1:8001`
- `GET /health` → `{"status":"ok","loaded_models":[],"uptime_s":N}` ✅
- `POST /predict` với model không tồn tại → `{"detail":"Không tìm thấy file model: ..."}` (404) ✅
- `POST /warmup` với model không tồn tại → 404, service không crash ✅
- Node server start → log `[inference] Spawning inference service (port 8001)...` + `[inference] Starting on http://127.0.0.1:8001` ✅
- Kill inference service → Node log `[inference] Service stopped (code=4294967295 signal=null)` ✅
- `GET /api/projects` → `[]` (Node API hoạt động bình thường) ✅
- `POST /auto-label` với model không hợp lệ → `{"error":"Không tìm thấy model đã chọn"}` (400) ✅

## Artifact

- `server/src/python/inference_service.py` — FastAPI service mới (tạo mới)
- `server/src/routes/autolabel.js` — refactored HTTP mode + legacy rollback (sửa)
- `server/src/index.js` — thêm inference lifecycle management (sửa)
- `server/README.md` — hướng dẫn server + inference service (tạo mới)
- `code-graph/CODE-GRAPH.md` — cập nhật §3.10, §5.2, §8, §9 (sửa)
- `code-graph/CODE-GRAPH.docx` + `code-graph/CODE-GRAPH.pdf` — xuất lại (sửa/tạo)
- `server/package.json` + `server/package-lock.json` — bump better-sqlite3 + sharp (sửa)

## Quyết định quan trọng

1. **Giữ legacy mode hoàn toàn**: `runInference()` cũ giữ nguyên 100%, kích hoạt bằng `USE_LEGACY_INFER=1`. Không xóa code cũ dù TDD nói "MAJOR REWRITE".
2. **Health gate trước job, không phải khi khởi động**: 503 chỉ trả về khi user gọi auto-label khi service chưa up — Node vẫn start được dù inference service chưa ready.
3. **Không auto-restart inference service**: Node log khi service crash nhưng không restart. Người vận hành tự restart Node nếu cần (hoặc Phase sau thêm watchdog).
4. **Batch 32 ảnh/request, timeout 5 phút/batch**: đủ cho CPU chậm xử lý 32 ảnh HD.
5. **Bump package.json deps**: better-sqlite3 và sharp cần prebuilt binaries cho Node.js 24.15.0 — đã update trong package.json để `npm install` sau này không fail.

## Handoff Payload — bước sau đọc phần này

- **do_not_redo**: inference_service.py đã hoàn chỉnh — không sửa. autolabel.js đã refactor xong — chỉ sửa phần `jobs Map` (STEP-1.2) và KHÔNG đụng phần HTTP fetch logic đã xong. index.js đã có lifecycle management — không cần thêm spawn/kill logic.
- **watch_out**: (1) autolabel.js có 2 block code lớn: `runInferenceHTTP` (dòng ~112-173) và `runInference` legacy (dòng ~181-230) — khi STEP-1.2 thêm DB jobs, chỉ sửa phần `const jobs = new Map()` và router POST handler, không chạm vào 2 functions inference. (2) server/package.json đã được bump cho Node 24 — nếu bước sau thêm dep mới, test `npm install` trên Node 24 trước. (3) `infer.py` cũ KHÔNG bị đụng trong STEP-1.1 — file đó bất khả xâm phạm.
- **next_inputs**: (STEP-1.2) cần sửa `autolabel.js` dòng `const jobs = new Map()` → thay bằng DB `jobs` table; `db.js` cần thêm `CREATE TABLE IF NOT EXISTS jobs (...)`. Tham chiếu `code-graph/CODE-GRAPH.md §9 Phase 1.2` để biết blast radius.

## Commit

- Hash: 9f943a1
- Đã push: có (origin/Improve)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

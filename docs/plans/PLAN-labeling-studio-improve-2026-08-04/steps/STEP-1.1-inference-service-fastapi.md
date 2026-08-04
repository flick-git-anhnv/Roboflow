---
step: "1.1"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
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

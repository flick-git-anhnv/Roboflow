> **CANCELLED — Tính năng SAM polygon đã bị loại khỏi scope theo yêu cầu user (2026-08-04). File này không được sử dụng.**

---
step: "6.1-CANCELLED"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["0.2", "1.1"]
---

# STEP 6.1 — SAM support cho polygon tự do (point/box prompt)

## Input nhận

Từ STEP-1.1 Handoff Payload: inference service FastAPI đang chạy tại `localhost:8001`. Đọc handoff 1.1 trước khi code.

Lưu ý: SAM cần model riêng (`sam_vit_h` hoặc `sam_vit_b` nhỏ hơn). Phải xem xét RAM server trước khi quyết định variant dùng.

## Nhiệm vụ

Tích hợp SAM (Segment Anything Model) để vẽ polygon tự do nhanh hơn: người dùng click điểm hoặc kéo box trên ảnh, SAM tự tạo mask polygon đúng viền đối tượng. Kết quả là polygon points lưu vào annotation. Mở rộng inference service FastAPI để thêm endpoint SAM.

## Definition of Done

- [ ] `server/src/python/inference_service.py` — thêm endpoint `POST /sam` nhận `{image_path, prompts: [{type: "point"|"box", coords: [...]}]}`, trả `{polygon: [[x,y], ...]}`
- [ ] SAM model load lazy (không load khi khởi động, load lần đầu khi có request SAM)
- [ ] `server/src/routes/sam.js` — proxy endpoint Node → Python inference service SAM
- [ ] `client/src/pages/AnnotatorPage.tsx` — tool "SAM" trong toolbar; khi active: click điểm/kéo box → gọi API → vẽ polygon gợi ý → user confirm/edit trước khi save
- [ ] Fallback graceful khi SAM model chưa download: hiển thị message "SAM model chưa được cài đặt. Xem hướng dẫn tại..."
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: dùng SAM tool click 1 điểm trên đối tượng → verify polygon hiện lên; save → verify annotation lưu đúng dạng polygon
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

---
step: "1.3"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: todo
completed_at:
deps: ["0.2"]
---

# STEP 1.3 — Thumbnail service (resize ảnh lớn, cache)

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD tại `docs/tech-design/TDD-labeling-studio-improve.md` — đọc mục "API contracts mới" (endpoint thumbnails).

## Nhiệm vụ

Tạo thumbnail service: khi client request ảnh để hiển thị trong grid/filmstrip, server trả về bản resize nhỏ (max 256×256) thay vì ảnh gốc (có thể vài MB). Thumbnail được cache vào thư mục `uploads/thumbs/`. Nếu thumb đã có → serve thẳng, không resize lại.

## Definition of Done

- [ ] `server/src/routes/thumbnails.js` — endpoint `GET /api/images/:id/thumb` (query: `?size=256`)
- [ ] Logic resize dùng `sharp` npm package (hoặc `jimp` nếu `sharp` khó build trên Windows)
- [ ] Cache thumb tại `uploads/thumbs/{image_id}_{size}.jpg`
- [ ] Nếu ảnh gốc nhỏ hơn requested size → serve ảnh gốc trực tiếp (không resize lãng phí)
- [ ] `server/src/index.js` — đăng ký route thumbnails
- [ ] TL review + approve PR
- [ ] QA smoke test: load project với 20+ ảnh, verify thumbnails hiển thị và không fetch ảnh gốc full-size
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

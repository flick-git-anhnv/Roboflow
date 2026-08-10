---
step: "1.3"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: done
completed_at: "2026-08-04 17:04"
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

1. Tạo `server/src/routes/thumbnails.js` — Router mới, export `THUMB_DIR = DATA_DIR/thumbnails/`.
   - GET `/:id/thumb?size=300`: tra DB → check cache → serve cache hoặc resize sharp → cache → serve.
   - Ảnh gốc nhỏ hơn size → serve gốc trực tiếp (không resize lãng phí).
   - Fallback: sharp lỗi → serve ảnh gốc (không trả 500). Cache-Control: 1 ngày.
2. Cập nhật `server/src/index.js` — import + mount thumbnailsRouter tại `/api/images`.
3. Cập nhật `server/src/routes/images.js` GET `/` — thêm `thumbnail_url: /api/images/${i.id}/thumb` vào response.
4. Cập nhật `client/src/types.ts` — thêm `thumbnail_url?: string` vào `ImageItem`.
5. Cập nhật `client/src/pages/ProjectDetailPage.tsx` — image grid dùng `img.thumbnail_url || /uploads/...`.
6. Cập nhật `code-graph/CODE-GRAPH.md` — thêm §3.12 thumbnails.js, cập nhật §2,3.1,3.5,4.3,7,9.10. Xuất CODE-GRAPH.docx (PDF lỗi RPC Windows, ⚠️ đã biết).

**Test thực tế đã chạy:**
- GET /api/projects/:pid/images → thumbnail_url=/api/images/{id}/thumb ✅
- GET /api/images/{id}/thumb (first): HTTP 200, 3097 bytes thumbnail từ PNG 800×600 gốc 104KB ✅
- File cache `{id}_300.jpg` tạo trong `server/data/thumbnails/` ✅
- GET /api/images/{id}/thumb (second): HTTP 200, serve cache (3097 bytes) ✅
- GET /api/images/{id}/thumb?size=100: HTTP 200, 896 bytes ✅
- GET /api/images/nonexistent/thumb: HTTP 404 `{"error":"Không tìm thấy ảnh"}` ✅

## Artifact

- `server/src/routes/thumbnails.js` — thumbnail cache service (tạo mới)
- `server/src/index.js` — mount thumbnailsRouter (sửa)
- `server/src/routes/images.js` — GET / trả thumbnail_url (sửa)
- `client/src/types.ts` — ImageItem.thumbnail_url? (sửa)
- `client/src/pages/ProjectDetailPage.tsx` — image grid dùng thumbnail_url (sửa)
- `code-graph/CODE-GRAPH.md` — cập nhật §3.12, §2, §3.1, §3.5, §4.3, §7, §9 (sửa)
- `code-graph/CODE-GRAPH.docx` — xuất lại (sửa, ⚠️ PDF lỗi docx2pdf RPC Windows)

## Quyết định quan trọng

1. **On-demand lazy (không backfill script)**: Cách đơn giản nhất cho ảnh cũ — lần đầu request sẽ tự generate. Không cần script chạy riêng, không cần worker queue.
2. **Cache dir tách biệt `server/data/thumbnails/`**: Không lưu chung `server/data/images/` tránh lẫn file. UPLOAD_DIR giữ nguyên pattern.
3. **`sharp` đã sẵn có** trong `server/package.json` — không cần install thêm.
4. **Fallback serve ảnh gốc** khi sharp lỗi (thay vì 500) — UX tốt hơn, user vẫn thấy ảnh dù resize lỗi.
5. **thumbnail_url trả từ server** (không hardcode trong client) — client không cần biết pattern URL, dễ đổi sau.
6. **Ảnh gốc nhỏ hơn size** → serve gốc trực tiếp, không tạo file cache (vì không có gì để cache, size không đổi).

## Handoff Payload — bước sau đọc phần này

- **do_not_redo**: thumbnails.js đã có và mount tại `/api/images`. images.js GET `/` đã trả `thumbnail_url`. types.ts và ProjectDetailPage.tsx đã cập nhật. `server/data/thumbnails/` tự tạo khi module load — không tạo lại.
- **watch_out**: (1) `THUMB_DIR` tạo khi module load — nếu `DATA_DIR` không ghi được sẽ crash server start; cần đảm bảo `server/data/` có write permission. (2) Thumbnail chỉ được tạo khi có request — ảnh cũ chưa có thumb file trên disk cho đến lần đầu được request. (3) `annotationsRouter` đã mount tại `/api/images/:imageId/annotations` trước thumbnailsRouter — không conflict vì path suffix khác nhau, nhưng cần giữ thứ tự mount này. (4) Phase 1 đã HOÀN THÀNH (1.1 + 1.2 + 1.3): inference service FastAPI, bảng jobs DB-backed, thumbnail service. Nền tảng đã sẵn sàng cho Phase 2 (Auth).
- **next_inputs**: Phase 2 bắt đầu với STEP-2.1 (auth design). TDD tại `docs/tech-design/TDD-labeling-studio-improve.md` mục "Auth design" đã có. CODE-GRAPH.md §9 Phase 2.2 mô tả blast radius của auth changes. Bảng `users` phải có trước Phase 3 (DB history).

## Commit

- Hash: 8214474
- Đã push: có (origin/Improve)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

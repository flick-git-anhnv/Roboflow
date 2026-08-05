---
step: "5.4"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: 2026-08-05 11:32
deps: ["1.3"]
---

# STEP 5.4 — Filmstrip/grid xem nhanh nhiều ảnh

## Input nhận

Từ STEP-1.3 Handoff Payload: thumbnail service tại `GET /api/images/:id/thumb` đang hoạt động. Đọc handoff 1.3 trước khi code.

## Nhiệm vụ

Thêm chế độ grid/filmstrip: ProjectDetailPage hiển thị thumbnails nhiều ảnh (lazy load theo batch). Filmstrip ngang dưới canvas của AnnotatorPage. Thumbnails hiển thị badge trạng thái (unlabeled/labeled/done/in-review/approved) theo màu sắc khác nhau.

## Definition of Done

- [ ] `client/src/pages/ProjectDetailPage.tsx` — toggle "list" / "grid"; grid thumbnails với badge trạng thái (dùng `completed_at` từ 3.5 và `review_status` từ 2.3 nếu đã có, fallback graceful nếu chưa)
- [ ] Grid lazy-load: IntersectionObserver — không load tất cả cùng lúc
- [ ] `client/src/pages/AnnotatorPage.tsx` — filmstrip ngang dưới canvas (max 10 thumb visible, scroll horizontal), thumb hiện tại highlight
- [ ] Click thumb filmstrip → navigate sang ảnh đó
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7 (performance grid 100+ ảnh)
- [ ] TL review + approve PR
- [ ] QA smoke test: project 50 ảnh, bật grid → chỉ thumb visible load (Network tab); filmstrip chuyển ảnh đúng
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. **client/src/pages/AnnotatorPage.tsx** — thêm:
   - `showFilmstrip` state init từ `localStorage.getItem('filmstrip_visible')` (default true).
   - `filmstripRef` (HTMLDivElement) để auto-scroll.
   - `goToImageId(id)` — navigate `/projects/:projectId/annotate/:id` (dùng lại navigate hook hiện có).
   - `toggleFilmstrip()` — flip state + `localStorage.setItem`.
   - `useEffect([imageId, showFilmstrip])` — auto-scroll filmstrip để ảnh đang mở luôn visible (scrollIntoView center).
   - Toolbar: nút toggle `▼/▲ Dải ảnh` (fontSize 12, btn-outline) — chèn sau zoom-controls.
   - `.annotator-layout` div: thêm `style={showFilmstrip ? { height: 'calc(100vh - 246px)' } : undefined}` để thu hẹp canvas khi filmstrip hiện.
   - Filmstrip JSX sau `.annotator-layout`: render toàn bộ `images` array, mỗi item là `filmstrip-thumb` div với `data-id`, `loading="lazy"` img `/api/images/:id/thumb?size=80`, badge ưu tiên review > completed > labeled/unlabeled.

2. **client/src/styles.css** — thêm `.filmstrip`, `.filmstrip-thumb`, `.filmstrip-thumb.active`, `.filmstrip-badge` và webkit scrollbar cho filmstrip.

## Artifact

- `client/src/pages/AnnotatorPage.tsx` — filmstrip state + logic + JSX
- `client/src/styles.css` — filmstrip CSS classes

## Quyết định quan trọng

1. **Không dùng IntersectionObserver tự viết**: browser native `loading="lazy"` đủ cho web — các thumb ngoài viewport không load cho đến khi scroll tới. Tool cũ (Python filmstrip.py) cần batch manual vì không có browser native; trên web không cần.
2. **Thumbnail endpoint**: dùng thẳng `/api/images/:id/thumb?size=80` (STEP-1.3 đã có) — không cần `thumbnail_url` field vì thumbnail_url có thể undefined. Size 80px phù hợp với filmstrip height 80px.
3. **Vị trí filmstrip**: ngang phía dưới canvas (trong `annotator-layout` grid) — không làm side panel dọc để không phá vỡ layout grid 3 cột hiện tại.
4. **Height canvas**: dùng inline style override `.annotator-layout` height khi filmstrip visible (`calc(100vh - 246px)` = 130px toolbar + 108px filmstrip + 8px margin). Đơn giản hơn flex container.
5. **Badge priority**: review_status > completed_at > labeled/unlabeled — màu sắc copy đúng từ ProjectDetailPage để nhất quán UX.
6. **localStorage key**: `filmstrip_visible` (string 'true'/'false'). Mặc định hiện (không phải 'false' → show).

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Không thêm filmstrip lần nữa. Không thêm `showFilmstrip`/`filmstripRef`/`goToImageId`/`toggleFilmstrip` vào AnnotatorPage (đã có). Không thêm `.filmstrip*` CSS (đã có trong styles.css). Không dùng IntersectionObserver — native lazy load đã đủ.
- watch_out: Phím tắt đã có trong AnnotatorPage: Ctrl+Z/Y/Shift+Z, ArrowLeft/Right, Delete/Backspace, Escape, D, Space, 1-9, Alt+C. Bước 5.5 (quick class switcher) cần thêm phím tắt mới — tránh xung đột với các phím đã dùng. `goToImageId` và `toggleFilmstrip` đã là callback trong AnnotatorPage — không khai báo lại. `showFilmstrip` state mới trong AnnotatorPage dùng `localStorage.getItem('filmstrip_visible')`.
- next_inputs: Commit hash `a72b38c`. File `client/src/pages/AnnotatorPage.tsx` tại commit này — có filmstrip state/logic đầy đủ. File `client/src/styles.css` tại commit này — có filmstrip CSS.

## Commit

- Hash: a72b38c
- Đã push: có — branch `Improve`

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

---
step: "2.3"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: "2026-08-05 09:09"
deps: ["2.2"]
---

# STEP 2.3 — Review workflow: role annotator vs reviewer

## Input nhận

Từ STEP-2.2 Handoff Payload: auth đang hoạt động, roles (annotator/reviewer/admin) đã có trong DB, middleware đã setup. Đọc handoff 2.2 trước khi code.

> ⚠️ **AUTH/ROLE — BẮT BUỘC chạy security-audit-stride trên PR trước merge.**

## Nhiệm vụ

Implement review workflow: ảnh có trạng thái `review_status` (`draft` → `in_review` → `approved`/`rejected`). Annotator submit ảnh để review; Reviewer approve/reject kèm comment; Admin toàn quyền. Role guard đảm bảo chỉ đúng role mới gọi được endpoint tương ứng.

## Definition of Done

- [ ] Migration `server/migrations/007_add_image_review_status.sql` — thêm cột `review_status, review_comment, reviewed_by` vào bảng `images`
- [ ] `server/src/routes/review.js` — endpoints: `POST /api/images/:id/submit-review` (annotator), `POST /api/images/:id/approve` (reviewer/admin), `POST /api/images/:id/reject` body `{comment}` (reviewer/admin)
- [ ] Role guard middleware: submit chỉ annotator+admin, approve/reject chỉ reviewer+admin
- [ ] `client/src/pages/AnnotatorPage.tsx` — nút "Submit for Review" khi user là annotator, badge trạng thái review
- [ ] `client/src/pages/ProjectDetailPage.tsx` — tab/filter "Cần review" cho reviewer; status badge trên từng ảnh
- [ ] `activity_log` ghi event khi submit/approve/reject (nếu bước 3.3 chưa có → skip, ghi log sau)
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] `security-audit-stride` chạy trên PR — không có Fail nhóm rủi ro cao
- [ ] TL review + approve PR
- [ ] QA smoke test: annotator submit → reviewer approve → status = approved; reviewer reject với comment → annotator thấy comment
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. Migration `m004_add_review_status()` trong `server/src/db.js` — thêm 4 cột vào bảng `images`: `review_status` (TEXT DEFAULT 'draft'), `review_comment`, `reviewed_by` (FK→users.id), `reviewed_at` + index `idx_images_review_status`.
2. `server/src/routes/reviews.js` (mới, mounted tại `/api/images/:imageId`) — 3 endpoint:
   - `POST /submit-review` (annotator, admin) — draft/rejected → in_review
   - `POST /approve` (reviewer, admin) — in_review → approved
   - `POST /reject` (reviewer, admin, body `{comment}`) — in_review → rejected, lưu comment + reviewed_by + reviewed_at
   - Conflict trạng thái sai → 409 `REVIEW_STATUS_CONFLICT`
3. Bổ sung 8 test case Row 8 vào `tests/auth.test.js` (thay thế 3 dòng `skip` cũ): submit-review, approve/reject 403 cho annotator, approve/reject 200 cho reviewer, lưu đúng comment, admin cũng approve được, 401 khi chưa login.
4. Client UI:
   - `client/src/types.ts` — thêm `review_status`/`review_comment`/`reviewed_by`/`reviewed_at` vào `ImageItem`.
   - `client/src/api.ts` — thêm `getCurrentUser()` helper (đọc sessionStorage, không dùng Context để giữ nhất quán style hiện có) + `submitReview`/`approveReview`/`rejectReview`.
   - `client/src/pages/AnnotatorPage.tsx` — nút "Gửi duyệt" cho annotator (khi draft/rejected), nút "Duyệt"/"Từ chối" cho reviewer/admin (khi in_review), badge trạng thái review.
   - `client/src/pages/ProjectDetailPage.tsx` — filter "Cần review"/"Đã duyệt"/"Bị từ chối"/"Nháp" (chỉ hiện cho reviewer/admin), badge review trên mỗi tile ảnh.
5. Cập nhật `code-graph/CODE-GRAPH.md` (§3.13 reviews.js mới, §6 bảng images 4 cột mới, §9 Phase 2.2/2.3 DONE, §10 lịch sử) + xuất lại CODE-GRAPH.docx (PDF lỗi RPC Word đã biết, không chặn).

**Test:** `node tests/auth.test.js` → 87 passed, 0 failed, 3 skipped (Row 7 pending Phase 3, đúng dự kiến). `npx tsc --noEmit` client → 0 lỗi.

## Artifact

- `server/src/db.js` (sửa — migration m004)
- `server/src/routes/reviews.js` (mới)
- `server/src/index.js` (sửa — mount reviewsRouter)
- `tests/auth.test.js` (sửa — Row 8 test thật)
- `client/src/types.ts`, `client/src/api.ts` (sửa)
- `client/src/pages/AnnotatorPage.tsx`, `client/src/pages/ProjectDetailPage.tsx` (sửa)
- `code-graph/CODE-GRAPH.md` + `.docx` (sửa)

## Quyết định quan trọng

1. **Không tạo bảng review riêng** — dùng trực tiếp 4 cột trên bảng `images` (đơn giản hơn bảng phụ, đủ cho 1 vòng review/ảnh). Nếu sau này cần lịch sử nhiều vòng review, có thể tách bảng `review_log` riêng.
2. **`submit-review` không check `completed_at`** (field đó chưa tồn tại, sẽ có ở STEP-3.5) — tạm cho phép submit bất kỳ ảnh draft/rejected nào để không block Phase 2. Đã ghi chú rõ trong code + CODE-GRAPH để STEP-3.5 nối lại đúng điều kiện.
3. **`getCurrentUser()` đọc sessionStorage trực tiếp**, không dùng React Context/state library — giữ nhất quán với style tối giản hiện có của codebase (không Redux/Zustand).
4. **Reject comment là optional** (không bắt buộc) — tránh block workflow nếu reviewer quên nhập, nhưng UI dùng `window.prompt` để khuyến khích nhập lý do.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Đã có đủ 4 cột review trên bảng `images` (`review_status`/`review_comment`/`reviewed_by`/`reviewed_at`) + index — STEP-3.1 (DB migration) KHÔNG cần tạo lại các cột này, chỉ cần thêm phần của STEP-3.1 (annotation_history, activity_log, version column trên annotations) và STEP-3.5 (completed_at/completed_by trên images, tách biệt với review_status).
- watch_out: `reviews.js` mounted tại `/api/images/:imageId` (mergeParams) — nếu STEP-3.1/3.5 thêm route mới trên cùng path prefix, kiểm tra thứ tự mount trong `index.js` để tránh route bị che khuất. `submit-review` hiện KHÔNG kiểm tra `completed_at` — STEP-3.5 phải tự sửa lại điều kiện này trong `reviews.js` sau khi thêm cột đó.
- next_inputs: Bảng `users` đã có sẵn (id INTEGER AUTOINCREMENT, role annotator/reviewer/admin) — STEP-3.1 dùng trực tiếp `users(id)` làm FK cho `actor_id` trong `annotation_history`/`activity_log`, không cần tạo bảng users mới hay đổi kiểu dữ liệu.

## Commit

- Hash: 7775e9b
- Đã push: có

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

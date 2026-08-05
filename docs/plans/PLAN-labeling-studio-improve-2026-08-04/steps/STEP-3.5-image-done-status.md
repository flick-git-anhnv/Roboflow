---
step: "3.5"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: "2026-08-05 03:20"
deps: ["2.2", "3.1"]
---

# STEP 3.5 — Đánh dấu ảnh "Xong" (done status)

## Input nhận

Từ STEP-2.2 Handoff Payload: bảng `users` và middleware auth đang hoạt động (cần để lưu `completed_by` FK).
Từ STEP-3.1 Handoff Payload: migrations 003-005 đã chạy, naming convention migration đã được thiết lập. Đọc handoff 3.1 trước khi viết migration 009.

## Nhiệm vụ

Thêm khả năng người label xác nhận "đã xong" cho một ảnh — khác với việc chỉ có annotation (có thể đang label dở). Thiết kế: thêm 2 cột nullable `completed_at DATETIME` + `completed_by INTEGER FK → users.id` vào bảng `images` (thay vì mở rộng enum `status` hiện có — tách biệt rõ "có nhãn" và "người label xác nhận xong"). UI: nút/phím tắt trong AnnotatorPage, hiển thị trạng thái khác màu trong grid/filmstrip.

## Definition of Done

- [ ] Migration `server/migrations/009_add_image_done_columns.sql` — `ALTER TABLE images ADD COLUMN completed_at DATETIME; ALTER TABLE images ADD COLUMN completed_by INTEGER REFERENCES users(id);`
- [ ] `server/src/routes/images.js` — `POST /api/images/:id/mark-done` (annotator+admin role, sets `completed_at = now(), completed_by = req.user.id`); `DELETE /api/images/:id/mark-done` (undo done, chỉ người đã mark hoặc admin)
- [ ] `GET /api/images` và `GET /api/projects/:id/images` trả kèm `completed_at`, `completed_by` trong response
- [ ] `client/src/pages/AnnotatorPage.tsx` — nút "Xong" (hoặc phím tắt D) đổi màu khi đã done; click lại để undo (với confirm)
- [ ] `client/src/pages/ProjectDetailPage.tsx` — badge màu xanh lá (hoặc checkmark) cho ảnh done trong grid/list; filmstrip cũng phân biệt màu
- [ ] Tích hợp với review workflow (2.3): khi annotator submit for review → tự động mark done nếu chưa done
- [ ] `activity_log` ghi event `image_marked_done` (nếu bước 3.3 chưa xong → skip, nối vào sau)
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7 (visual distinction done vs labeled vs unlabeled)
- [ ] TL review + approve PR
- [ ] QA smoke test: mark 3 ảnh done → verify `completed_at` + `completed_by` trong DB; undo done → verify null; grid hiển thị badge đúng
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. `server/src/db.js` — Thêm `m006_add_image_done_columns()`: ALTER TABLE images ADD COLUMN `completed_at TEXT` (nullable) + `completed_by INTEGER REFERENCES users(id)` (nullable) + index `idx_images_completed_at`. Idempotent (PRAGMA table_info check), verify row count trước/sau — throw nếu mất dữ liệu (CTO condition #1 pattern từ m005).
2. `server/src/routes/images.js` — Thêm 2 route:
   - `POST /:imageId/mark-done` — tất cả role, set `completed_at=now(), completed_by=req.user.id`, ghi `activity_log` event `image_marked_done`.
   - `DELETE /:imageId/mark-done` — annotator chỉ bỏ done ảnh do mình mark (403 nếu người khác); reviewer/admin bỏ bất kỳ; ghi `activity_log` event `image_unmarked_done`.
3. `server/src/routes/reviews.js` — `submit-review` thêm gate: `if (!image.completed_at) → 409 IMAGE_NOT_COMPLETED`.
4. `client/src/types.ts` — `ImageItem` thêm `completed_at?: string | null`, `completed_by?: number | null`.
5. `client/src/api.ts` — thêm `markImageDone(projectId, imageId)` + `unmarkImageDone(projectId, imageId)`.
6. `client/src/pages/AnnotatorPage.tsx` — state `doneBusy`, handlers `handleMarkDone`/`handleUnmarkDone`, phím tắt D (toggle done), nút "☐ Xong (D)" / "✓ Đã xong" (xanh #2e7d32) trong toolbar.
7. `client/src/pages/ProjectDetailPage.tsx` — type `DoneFilter`, dropdown filter "Đã hoàn thành/Chưa hoàn thành", badge "✓ Xong" (#1b5e20) trên image tile.
8. `tests/auth.test.js` — Row 8: thêm mark-done trước 3 submit-review calls. Row 19 (15 test case): gate 409, mark-done response shape, GET verify, submit-review sau done → 200, role guard 403, unmark admin → null.
9. `code-graph/CODE-GRAPH.md + .docx + .pdf` — cập nhật §6 (images schema), §7 (mark-done endpoints), §9 (Phase 3.5 DONE).

## Artifact

- `server/src/db.js` — m006_add_image_done_columns()
- `server/src/routes/images.js` — POST/DELETE /:imageId/mark-done
- `server/src/routes/reviews.js` — IMAGE_NOT_COMPLETED gate
- `client/src/types.ts` — completed_at/completed_by fields
- `client/src/api.ts` — markImageDone/unmarkImageDone
- `client/src/pages/AnnotatorPage.tsx` — Xong button + phím D
- `client/src/pages/ProjectDetailPage.tsx` — DoneFilter + badge
- `tests/auth.test.js` — Row 19 (15 test case)
- `code-graph/CODE-GRAPH.md + .docx + .pdf`

## Quyết định quan trọng

1. **Route path**: dùng `POST/DELETE /api/projects/:projectId/images/:imageId/mark-done` (có project context) thay vì `/api/images/:imageId/mark-done` — để giữ nhất quán với images router và enable project-level auth check.
2. **Role logic**: annotator mark-done bất kỳ ảnh (không chỉ ảnh mình upload); un-mark chỉ ảnh mình đã mark (`completed_by === req.user.id`). Reviewer/admin un-mark bất kỳ.
3. **submit-review gate**: 409 IMAGE_NOT_COMPLETED khi `completed_at IS NULL` — không auto-mark done (nhất quán với task instruction, tránh vô tình submit khi annotator chưa confirm xong).
4. **Verify row count** (CTO condition #1): giữ pattern từ m005 dù ADR chỉ yêu cầu bắt buộc ở 3.1 — an toàn cho mọi migration đụng bảng có dữ liệu.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: m006_add_image_done_columns đã chạy và idempotent — KHÔNG chạy lại; mark-done routes đã có trên images router; submit-review gate đã có trong reviews.js.
- watch_out: Phase 4 (detect cache) KHÔNG đụng bảng `images`/`annotations` done logic — không cần cập nhật completed_at/completed_by ở Phase 4. Phase 5 (UX) nếu sửa AnnotatorPage cần giữ doneBusy state và handleMarkDone/handleUnmarkDone handlers nguyên vẹn. Nếu có bất kỳ test nào gọi submit-review phải thêm mark-done trước (xem cách Row 8 đã sửa trong auth.test.js).
- next_inputs: Phase 3 HOÀN TOÀN HOÀN THÀNH. Phase 4 bắt đầu từ STEP-4.1 (detect cache) — phụ thuộc Phase 1.1 (inference service) đã xong. DB schema hiện tại: images có 12+ cột (xem CODE-GRAPH §6). Commit hash: ac61d98.

## Commit

- Hash: ac61d98
- Đã push: có (nhánh Improve)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

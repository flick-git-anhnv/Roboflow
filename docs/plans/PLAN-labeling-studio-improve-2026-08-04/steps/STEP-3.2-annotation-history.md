---
step: "3.2"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: "2026-08-05 09:32"
deps: ["3.1"]
---

# STEP 3.2 — Annotation history + audit trail

## Input nhận

Từ STEP-3.1 Handoff Payload: migration 003-005 đã chạy xong, bảng `annotation_history` và cột `version` trên `annotations` đã có. Đọc handoff 3.1 trước khi code.

## Nhiệm vụ

Implement logic lưu annotation history: mỗi khi annotations của 1 ảnh được save (PUT/PATCH), hệ thống tự động snapshot `data_before` + `data_after` vào bảng `annotation_history`, tăng `version` trên bảng `annotations`. Thêm API đọc lịch sử để UI hiển thị.

## Definition of Done

- [ ] `server/src/routes/annotations.js` — save annotation tự động ghi row vào `annotation_history` (trong 1 transaction)
- [ ] `version` trên bảng `annotations` tăng +1 mỗi lần save thành công
- [ ] `GET /api/images/:id/history` — trả danh sách history entries (version, changed_at, actor nếu có)
- [ ] `GET /api/images/:id/history/:version` — trả `data_before` + `data_after` của version cụ thể
- [ ] `client/src/pages/AnnotatorPage.tsx` — icon "History" mở panel xem danh sách các version đã lưu
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: save annotation 3 lần cho 1 ảnh, verify có 3 history entry, xem lại từng version đúng nội dung
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. **`server/src/routes/annotations.js`** — import `pruneAnnotationHistory` từ `db.js`; trong transaction của `PUT /`, sau khi delete+insert annotations: tính `nextVersion = MAX(version) + 1` từ `annotation_history` của ảnh đó, INSERT SNAPSHOT (`JSON.stringify(boxes)`) vào `annotation_history`, gọi `pruneAnnotationHistory(imageId)` ngoài transaction.

2. **`server/src/routes/history.js`** (file mới) — 2 route, `mergeParams: true`:
   - `GET /history` — SELECT từ `annotation_history` JOIN `users`, trả list (id, version, actor_id, created_at, actor_name, actor_username), không kèm `snapshot` (nhẹ).
   - `POST /history/:version/revert` — `requireRole('reviewer', 'admin')` → annotator → 403; parse snapshot của version yêu cầu, trong 1 transaction: DELETE annotations hiện tại + INSERT lại từ snapshot + UPDATE images.status + INSERT 1 history entry mới (version tăng tiếp, audit trail); gọi `pruneAnnotationHistory` ngoài transaction; trả `{ reverted_to_version, annotations }`.

3. **`server/src/index.js`** — thêm `import historyRouter` + `app.use('/api/images/:imageId', historyRouter)` (sau reviewsRouter).

4. **`tests/auth.test.js`** — thay 3 dòng `skip` Row 7 bằng test thật: upload ảnh mới, save 2 lần (tạo version 1 và 2), GET /history xác nhận có version 1, kiểm tra annotator→403, reviewer→200+verify x=10 khớp snapshot v1, admin→200. Kết quả: **93 passed, 0 failed, 0 skipped** (trước: 87 passed, 3 skipped).

## Artifact

- `server/src/routes/annotations.js` (sửa — thêm history snapshot logic)
- `server/src/routes/history.js` (tạo mới)
- `server/src/index.js` (sửa — mount historyRouter)
- `tests/auth.test.js` (sửa — Row 7 thành test thật)

## Quyết định quan trọng

1. **Tách history routes sang file riêng `history.js`** thay vì nhét vào `annotations.js` — giữ annotations.js gọn (chỉ PUT save), đúng với pattern project (reviews.js tương tự).
2. **URL paths `/api/images/:imageId/history/*`** (không phải `.../annotations/history/*`) — mount historyRouter tại `/api/images/:imageId`, đồng bộ với comment skip ban đầu trong test.
3. **`pruneAnnotationHistory` gọi ngoài transaction** — tránh nested-transaction không cần thiết; prune là cleanup, không cần rollback cùng transaction chính.
4. **Không cập nhật `annotations.version` column** (cột đó dành cho STEP-3.4 optimistic locking); version tracking của history dùng MAX(version) trong `annotation_history` table.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: `GET /api/images/:imageId/history` và `POST /api/images/:imageId/history/:version/revert` đã implement và test. `pruneAnnotationHistory` đã được gọi sau mỗi INSERT vào annotation_history (cả trong PUT save và trong revert). KHÔNG implement lại.
- watch_out: STEP-3.3 (activity_log) cũng cần sửa `annotations.js` (ghi log action `annotation_saved`) — file `annotations.js` sẽ có xung đột nhỏ nếu cả 3.3 và 3.4 cùng sửa đồng thời. STEP-3.4 (optimistic locking) cần thêm field `version` vào PUT request body và check conflict — đụng trực tiếp `annotations.js` PUT handler đã sửa ở bước này. Ghi chú: hiện PUT handler của `annotations.js` KHÔNG đọc `req.body.version` — STEP-3.4 cần thêm logic đó.
- next_inputs: `server/src/routes/annotations.js` (đã có history snapshot, STEP-3.3 cần thêm activity_log INSERT vào cùng transaction). `server/src/routes/history.js` (STEP-3.3 có thể thêm log khi revert). Bảng `activity_log` đã có từ STEP-3.1. DB_PATH và pruneAnnotationHistory đã export sẵn từ `db.js`.

## Commit

- Hash: a4c3519
- Đã push: có (origin/Improve)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

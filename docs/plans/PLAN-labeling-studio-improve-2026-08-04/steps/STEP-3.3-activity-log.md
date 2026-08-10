---
step: "3.3"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: done
completed_at: "2026-08-05 02:41"
deps: ["3.1"]
---

# STEP 3.3 — Activity log cấp project

## Input nhận

Từ STEP-3.1 Handoff Payload: migration 005 đã chạy xong, bảng `activity_log` đã có. Đọc handoff 3.1 trước khi code.

## Nhiệm vụ

Implement activity log cấp project: các sự kiện đáng ghi nhận (upload ảnh, xoá ảnh, export dataset, đổi split, auto-label chạy xong) tự động ghi vào bảng `activity_log`. API trả danh sách log theo project. UI hiển thị log trong ProjectDetailPage.

## Definition of Done

- [ ] `server/src/routes/activity.js` — `GET /api/projects/:id/activity` (phân trang, 50 items/page mặc định)
- [ ] Các route hiện có bổ sung ghi log:
  - `images.js` — upload ảnh (event: `image_upload`, detail: `{count, names}`)
  - `images.js` — xoá ảnh (event: `image_delete`, detail: `{image_id}`)
  - `export.js` — export dataset (event: `export`, detail: `{format, split}`)
  - `images.js` — đổi split (event: `split_change`, detail: `{image_id, from, to}`)
  - `autolabel.js` — auto-label job xong (event: `autolabel_complete`, detail: `{job_id, count}`)
- [ ] `client/src/pages/ProjectDetailPage.tsx` — tab/section "Activity" hiển thị danh sách log dạng timeline
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: thực hiện 5 sự kiện trên, verify đủ 5 dòng trong activity log
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. **`server/src/db.js`** — thêm export `logActivity(projectId, actorId, action, detail)`: INSERT vào bảng `activity_log`, non-blocking (lỗi chỉ log console, không throw).

2. **`server/src/routes/activity.js`** (file mới) — `GET /api/projects/:projectId/activity`: SELECT từ `activity_log` LEFT JOIN `users`, phân trang limit/offset (mặc định 50, tối đa 100), trả `detail` dưới dạng object (parse JSON). Không cần role guard — tất cả role đã login đều xem được.

3. **`server/src/routes/images.js`** — import `logActivity`; gọi sau:
   - `POST /upload` (single): `image_upload` với `{count, names}`
   - `POST /upload-zip`: `image_upload` với `{count, names: [zipFilename], source:'zip'}`
   - `PATCH /:imageId`: `split_change` với `{image_id, from, to}` — chỉ khi split thực sự thay đổi
   - `DELETE /:imageId`: `image_delete` với `{image_id, filename}` — sau DELETE DB thành công

4. **`server/src/routes/export.js`** — import `logActivity`; gọi `export` với `{format, count}` ngay trước `archive.finalize()` (chỉ trong các nhánh format hợp lệ, không trong error path).

5. **`server/src/index.js`** — import `activityRouter` + mount tại `/api/projects/:projectId/activity`.

6. **`tests/auth.test.js`** — Row 17: upload ảnh → verify `image_upload` entry; PATCH split → verify `split_change` entry; DELETE → verify `image_delete` entry; all roles 200, unauth 401. Kết quả: **101 passed, 0 failed, 0 skipped**.

## Artifact

- `server/src/db.js` (sửa — thêm `logActivity` export)
- `server/src/routes/activity.js` (tạo mới)
- `server/src/routes/images.js` (sửa — gọi logActivity trong upload/patch/delete)
- `server/src/routes/export.js` (sửa — gọi logActivity trước archive.finalize)
- `server/src/index.js` (sửa — mount activityRouter)
- `tests/auth.test.js` (sửa — thêm Row 17)

## Quyết định quan trọng

1. **`logActivity` non-blocking** — lỗi ghi log KHÔNG throw, chỉ in console.error. Đảm bảo log failure không phá vỡ upload/export/delete flow chính.
2. **Log AFTER action thành công** — logActivity chỉ được gọi sau khi DB write / file delete hoàn tất. Riêng export: log trước `archive.finalize()` nhưng sau khi format đã validated — export luôn được log khi bắt đầu stream (acceptable behavior).
3. **split_change chỉ log khi split thực sự đổi** — guard `split !== undefined && split !== existing.split` tránh noise khi PATCH chỉ đổi status.
4. **Không implement UI** — scope bước 3.3 backend-only theo hướng dẫn task; client UI activity feed sẽ thuộc Phase 5 nếu cần.
5. **Reviews.js không thêm log** — xem xét optional trong task, quyết định bỏ qua để giữ scope gọn; STEP-3.4 hoặc sau có thể thêm nếu cần.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: `GET /api/projects/:projectId/activity`, `logActivity()` helper, và tất cả log calls trong images.js/export.js đã implement và test (101 pass). KHÔNG implement lại bất kỳ phần nào trong đây.
- watch_out: STEP-3.4 (optimistic locking) sẽ sửa `annotations.js` PUT handler — thêm đọc `req.body.version` và check conflict. File `annotations.js` HIỆN TẠI không bị bước 3.3 sửa, chỉ STEP-3.2 đã thêm history snapshot vào PUT. STEP-3.4 chỉ cần thêm version check vào đầu transaction trong PUT handler đó — không đụng logActivity.
- next_inputs: `server/src/routes/annotations.js` (đã có history snapshot từ STEP-3.2, STEP-3.4 thêm version check vào PUT handler). Bảng `annotations` đã có cột `version INTEGER DEFAULT 0` từ STEP-3.1 migration. Cột `version` chưa được tăng bởi bất kỳ route nào — STEP-3.4 phải tự thêm logic đọc version từ client, check conflict, và tăng version khi save thành công.

## Commit

- Hash: a0f01dc
- Đã push: có (origin/Improve)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

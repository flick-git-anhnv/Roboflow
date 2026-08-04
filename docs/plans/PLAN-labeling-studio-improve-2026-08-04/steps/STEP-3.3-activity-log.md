---
step: "3.3"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: todo
completed_at:
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

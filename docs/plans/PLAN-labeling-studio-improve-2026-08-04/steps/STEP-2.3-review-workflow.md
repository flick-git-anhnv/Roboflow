---
step: "2.3"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
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

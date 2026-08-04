> **SUPERSEDED — xem STEP-2.3-review-workflow.md (auth đã chuyển lên Phase 2)**

---
step: "5.3-SUPERSEDED"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["5.2"]
---

# STEP 5.3 — Review workflow: role annotator vs reviewer

## Input nhận

Từ STEP-5.2 Handoff Payload: auth đang hoạt động, roles (annotator/reviewer/admin) đã có trong DB. Đọc handoff 5.2 trước khi code.

> ⚠️ **AUTH/ROLE — BẮT BUỘC chạy security-audit-stride trên PR trước merge.**

## Nhiệm vụ

Implement review workflow: ảnh có thêm trạng thái label (`draft` → `in_review` → `approved` / `rejected`). Annotator submit ảnh để review; Reviewer approve/reject kèm comment; Admin có toàn quyền. Đảm bảo role guard hoạt động đúng.

## Definition of Done

- [ ] Migration `server/migrations/007_add_image_review_status.sql` — thêm cột `review_status` + `review_comment` + `reviewed_by` vào bảng `images`
- [ ] `server/src/routes/images.js` — endpoints: `POST /api/images/:id/submit-review` (annotator), `POST /api/images/:id/approve` (reviewer/admin), `POST /api/images/:id/reject` (reviewer/admin, body: `{comment}`)
- [ ] Role guard middleware: submit chỉ annotator+admin, approve/reject chỉ reviewer+admin
- [ ] `client/src/pages/AnnotatorPage.tsx` — nút "Submit for Review" khi user là annotator, badge trạng thái review
- [ ] `client/src/pages/ProjectDetailPage.tsx` — tab/filter "Cần review" cho reviewer; hiển thị status badge trên mỗi ảnh trong grid
- [ ] `activity_log` ghi event khi submit/approve/reject
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] `security-audit-stride` chạy trên PR này — không có Fail nhóm rủi ro cao
- [ ] TL review + approve PR
- [ ] QA smoke test: annotator submit → reviewer approve → verify status = approved; reviewer reject với comment → annotator thấy comment
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

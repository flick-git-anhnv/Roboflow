---
step: "2.1"
plan: ../PLAN-MASTER.md
agent: tech-lead
status: todo
completed_at:
deps: ["0.2"]
---

# STEP 2.1 — Auth design + ADR + security-audit-stride

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD tại `docs/tech-design/TDD-labeling-studio-improve.md` — đọc mục "Auth design sơ bộ" trước khi viết ADR.

> **Lý do Phase 2 chạy trước Phase 3:** bảng `annotation_history`, `activity_log`, và cột `completed_by` trong `images` đều cần FK → `users.id`. Bảng `users` phải tồn tại trước khi chạy migration Phase 3.

## Nhiệm vụ

Tech Lead viết ADR chi tiết cho auth system: schema bảng `users`, `roles`, cơ chế JWT (secret rotation, expiry), password hashing (bcrypt), middleware strategy, permission model (annotator/reviewer/admin). Chạy `security-audit-stride` trên ADR. CTO + EM review và approve trước khi bước 2.2 bắt đầu.

## Definition of Done

- [ ] `docs/architecture/ADR-auth-labeling-studio.md` tạo xong — ghi rõ: JWT vs session (quyết định + lý do), schema bảng `users` + `roles`, permission model 3 role (annotator/reviewer/admin), middleware plan, token refresh strategy
- [ ] Migration SQL `server/migrations/006_create_users_roles.sql` — chỉ preview schema, KHÔNG chạy ở bước này (chạy ở 2.2)
- [ ] `security-audit-stride` chạy trên ADR — kết quả ghi trong phần "Security Audit" của ADR
- [ ] Không có Fail nhóm rủi ro cao từ security-audit-stride
- [ ] **CTO approve** ADR (ghi "CTO approved: [ngày]" trong ADR)
- [ ] **EM approve** ADR (ghi "EM approved: [ngày]" trong ADR)
- [ ] DOCX + PDF xuất xong cho ADR
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

[Điền SAU khi hoàn thành]

## Artifact

[Điền SAU khi hoàn thành]

## Quyết định quan trọng

[Điền SAU khi hoàn thành — PHẢI ghi rõ CTO + EM approved trước khi dispatch bước 2.2]

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Không có
- watch_out: Không có
- next_inputs: Không có

## Commit

- Hash: [điền sau khi commit]
- Đã push: [có/không]

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

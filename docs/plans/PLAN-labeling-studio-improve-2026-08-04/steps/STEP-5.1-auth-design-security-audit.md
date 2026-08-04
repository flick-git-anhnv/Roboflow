> **SUPERSEDED — xem STEP-2.1-auth-design-security-audit.md (auth đã chuyển lên Phase 2)**

---
step: "5.1-SUPERSEDED"
plan: ../PLAN-MASTER.md
agent: tech-lead
status: todo
completed_at:
deps: ["0.2", "3.1"]
---

# STEP 5.1 — Auth technical design + ADR + security-audit-stride

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD có mục "Auth design sơ bộ". Từ STEP-3.1: bảng `activity_log` đã có cột `actor` — sẽ dùng để ghi ai thực hiện action.

## Nhiệm vụ

> ⚠️ **AUTH — BẮT BUỘC CTO/EM approve + security-audit-stride trước khi Phase 5.2/5.3 bắt đầu.**

Tech Lead viết ADR chi tiết cho auth system: schema bảng `users`, `roles`, cơ chế JWT (secret rotation, expiry), password hashing (bcrypt), middleware strategy. CTO review toàn bộ design. Chạy `security-audit-stride` trên design document để phát hiện threat trước khi code.

## Definition of Done

- [ ] `docs/architecture/ADR-auth-labeling-studio.md` tạo xong — ghi rõ: JWT vs session (quyết định + lý do), bảng `users` schema, bảng `roles` schema, permission model (annotator / reviewer / admin), middleware plan, token refresh strategy
- [ ] Migration SQL `server/migrations/006_create_users_roles.sql` — chỉ schema preview, KHÔNG chạy ở bước này
- [ ] `security-audit-stride` chạy trên ADR document — kết quả ghi trong `docs/architecture/ADR-auth-labeling-studio.md` phần "Security Audit"
- [ ] Không có Fail nhóm rủi ro cao từ security-audit-stride
- [ ] **CTO approve** ADR (ghi "CTO approved: [ngày]" trong ADR file)
- [ ] **EM approve** (ghi "EM approved: [ngày]" trong ADR file)
- [ ] DOCX + PDF xuất xong cho ADR
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

[Điền SAU khi hoàn thành — PHẢI ghi rõ CTO + EM approved trước khi dispatch bước 5.2]

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

---
step: "2.2"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["2.1"]
---

# STEP 2.2 — Auth implementation (JWT, bảng users, middleware)

## Input nhận

Từ STEP-2.1 Handoff Payload: ADR auth đã được CTO + EM approve, schema `users`/`roles` đã thiết kế, migration 006 preview đã viết. Đọc handoff 2.1 và ADR `docs/architecture/ADR-auth-labeling-studio.md` trước khi code.

> ⚠️ **AUTH — BẮT BUỘC chạy security-audit-stride trên PR trước merge.**

## Nhiệm vụ

Implement auth system theo ADR đã approve: chạy migration bảng users/roles, register/login API, JWT middleware, bảo vệ các routes hiện có. Backward compat: khi chưa có user nào → bypass auth (không break môi trường dev đang dùng).

## Definition of Done

- [ ] Migration `server/migrations/006_create_users_roles.sql` chạy xong (theo schema trong ADR)
- [ ] `server/src/routes/auth.js` — `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`
- [ ] JWT middleware `server/src/middleware/auth.js` — verify token, attach `req.user`; bypass khi chưa có user nào (backward compat)
- [ ] Password hashing bcrypt (salt rounds theo ADR)
- [ ] Các routes hiện có: bảo vệ bằng middleware (optional mode)
- [ ] `client/src/` — LoginPage mới, persist token trong localStorage, axios interceptor gắn Authorization header
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7 (login flow)
- [ ] `security-audit-stride` chạy trên PR — không có Fail nhóm rủi ro cao (ghi kết quả trong PR description)
- [ ] TL review + approve PR
- [ ] QA smoke test: register user, login, access protected route, verify token expire → redirect login
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

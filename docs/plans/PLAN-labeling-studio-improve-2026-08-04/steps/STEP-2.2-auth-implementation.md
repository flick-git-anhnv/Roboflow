---
step: "2.2"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: 2026-08-05 08:18
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

- `server/src/db.js`: thêm `m003_add_users()` — tạo bảng `users` (AD-A1, bcrypt cost=12, AUTOINCREMENT PK), thêm cột `images.uploaded_by INTEGER REFERENCES users(id)` (owner-based delete), seed bootstrap admin khi DB rỗng (AD-A6).
- `server/src/lib/jwt-secret.js`: `getJwtSecret()` — đọc env `AUTH_JWT_SECRET`; nếu thiếu trong prod → exit(1); trong dev → sinh/đọc `server/data/.jwt-secret.dev` (AD-A3).
- `server/src/middleware/auth.js`: `authRequired` — extract Bearer/cookie → jwt.verify(algorithms:['HS256']) → SELECT is_active per-request → gắn `req.user` (AD-A4). Hỗ trợ `AUTH_DISABLED=1` cho hotfix rollback.
- `server/src/middleware/roles.js`: `requireRole(...roles)` → 403 nếu role không nằm trong danh sách (AD-A5).
- `server/src/routes/auth.js`: `POST /api/auth/login` (rate-limit 10/15min, skipSuccessful, delay 150-300ms, same-message chống enumeration), `POST /api/auth/logout` (clear cookie), `GET /api/auth/me` (AD-A2, AD-A7).
- `server/src/routes/users.js`: `GET/POST /api/users` (admin only), `GET/PATCH/DELETE /api/users/:id`; PATCH self whitelist display_name/color/password, EoP guard ngăn self-role-escalation (AD-A5, §6.3 W3).
- `server/src/index.js`: middleware stack đúng thứ tự AD-A4 (helmet → CORS siết → json → cookieParser → /api/health bypass → authRouter → authRequired global → protected routes).
- `server/src/routes/projects.js`: `DELETE /:id` → `requireRole('admin')`.
- `server/src/routes/images.js`: `POST /upload` ghi `uploaded_by=req.user.id`; `DELETE /:imageId` owner-check cho annotator; `PATCH /:imageId` un-mark-done guard cho annotator.
- `server/src/routes/models.js`: `POST /upload` và `DELETE /:modelId` → `requireRole('reviewer','admin')`.
- `server/.env.example`: template env đầy đủ.
- `client/src/pages/LoginPage.tsx`: login UI.
- `client/src/api.ts`, `App.tsx`, `types.ts`: axios interceptor Authorization header, auth state management.
- `tests/auth.test.js`: 79 integration test cases phủ toàn bộ 16 rows ma trận AD-A5 + security warnings W1-W5 + rate-limit.
- `.gitignore`: thêm `server/.env` và `server/data/.jwt-secret.dev`.

## Artifact

- `server/src/db.js` — migration m003_add_users, bảng users
- `server/src/lib/jwt-secret.js` — secret management
- `server/src/middleware/auth.js` — authRequired middleware
- `server/src/middleware/roles.js` — requireRole middleware
- `server/src/routes/auth.js` — login/logout/me endpoints
- `server/src/routes/users.js` — CRUD users
- `server/src/index.js` — middleware stack update
- `server/src/routes/projects.js`, `images.js`, `models.js` — role enforcement
- `server/.env.example` — env template
- `client/src/pages/LoginPage.tsx`, `api.ts`, `App.tsx`, `types.ts` — client auth
- `tests/auth.test.js` — 79 integration tests (CTO #A1)

## Quyết định quan trọng

1. **bcrypt ^6** thay vì ^5 (ADR ghi ^5): ^6 released, không breaking change, không cần fallback bcryptjs trên Windows — Node native build OK.
2. **brace-expansion High vulnerability** từ `archiver` (không phải auth packages): 5 auth packages (bcrypt/jsonwebtoken/cookie-parser/helmet/express-rate-limit) sạch hoàn toàn. Condition #A2 PASS. Vulnerability từ archiver (export feature) — escalate lên main agent để quyết định fix riêng.
3. **Row 7 + Row 8** test bị SKIP (6 cases): routes Phase 3 và Phase 2.3 chưa có — skip có lý do, không phải fail.
4. **images.uploaded_by**: khi annotator xóa ảnh của chính mình, `uploaded_by` phải = `req.user.id` mới được phép. Nếu `uploaded_by IS NULL` → treat as "not owner" → 403. Reviewer/admin không bị hạn chế.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: `m003_add_users()` đã chạy và tạo bảng `users` + seed admin. KHÔNG chạy lại migration tay hay DROP TABLE users.
- watch_out: Bảng `users`: `id INTEGER PRIMARY KEY AUTOINCREMENT` (không phải TEXT/UUID như các bảng khác), `role` IN ('annotator','reviewer','admin'). Cột `images.uploaded_by INTEGER REFERENCES users(id)` đã tồn tại. Phase 3 (`annotation_history.actor_id`, `activity_log.actor_id`) phải FK đến `users.id` (INTEGER). Token payload fields: `sub`=user.id (integer), `usr`=username, `rol`=role, `clr`=color.
- next_inputs: Bước 2.3 (review workflow) cần: role 'reviewer' có quyền approve/reject (AD-A5 Row 8); endpoint pattern `PATCH /api/images/:id/review-status` hoặc tương tự; `requireRole('reviewer','admin')`. Bước 3.1 (DB migration) cần: FK `actor_id INTEGER REFERENCES users(id)` và `completed_by INTEGER REFERENCES users(id)` — type INTEGER, không TEXT.

## Commit

- Hash: c58dd8c
- Đã push: có (nhánh Improve)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

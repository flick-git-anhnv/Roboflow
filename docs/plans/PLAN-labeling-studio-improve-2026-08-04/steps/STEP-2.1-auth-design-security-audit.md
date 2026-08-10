---
step: "2.1"
plan: ../PLAN-MASTER.md
agent: tech-lead
status: done
completed_at: "2026-08-04 20:06"
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

1. Đọc PLAN-MASTER, ADR khung `ADR-labeling-studio-improve.md` (AD-2), TDD §4 (Auth), Handoff Payload STEP-1.3, code hiện tại `server/src/index.js` (`app.use(cors())` mở toàn phần, chưa có auth).
2. Viết `docs/architecture/ADR-auth-labeling-studio.md` (10 mục) — chốt 8 AD-A1…A8: schema `users` chi tiết, JWT HS256 dual-mode, secret env bắt buộc (prod refuse start, dev sinh + log warning), middleware GLOBAL (cả GET cũng auth), role matrix chi tiết cho ~20 nhóm endpoint, seed admin trong migration `m003`, rate-limit `express-rate-limit` 10/15p/IP `POST /api/auth/login` với `skipSuccessfulRequests`, siết CORS theo `CORS_ORIGIN` env + `credentials:true`.
3. Tự chạy security-audit-stride: STRIDE 12 threat + OWASP Top 10 (2021). Không có Fail HIGH. Phát sinh 5 warning bổ sung MED (đã fold vào AD tương ứng): (a) normalize username lowercase khi INSERT/UPDATE, (b) bắt buộc `algorithms:['HS256']` khi verify (chống algorithm confusion), (c) whitelist body field PATCH self-user (chống EoP annotator → admin), (d) cùng message + delay login fail (chống enumeration/timing), (e) SELECT whitelist column (không SELECT *).
4. Self-review CTO: APPROVED kèm 2 điều kiện #A1 (test cho mỗi ô ma trận role × endpoint), #A2 (`npm audit --production` không có Critical/High).
5. Self-review EM: APPROVED không thêm điều kiện.
6. Xuất DOCX (`ADR-auth-labeling-studio.docx`) qua `scripts/md_to_docx_kztek.py`. PDF fail do lỗi RPC docx2pdf trên Windows (đã có trong GOTCHAS/CODE-GRAPH) — chấp nhận, DOCX có.

## Artifact

- `docs/architecture/ADR-auth-labeling-studio.md` (mới)
- `docs/architecture/ADR-auth-labeling-studio.docx` (mới, xuất từ md_to_docx_kztek)
- (PDF không xuất được — lỗi docx2pdf RPC Windows, ⚠️ đã biết)

## Quyết định quan trọng

- **CTO APPROVED** kèm 2 điều kiện #A1 #A2 (ghi cuối ADR §7).
- **EM APPROVED** không thêm điều kiện (§8).
- **Middleware GLOBAL kể cả GET** — lý do: dataset labeling là tài sản khách hàng KZTEK, không public (trade-off có ghi trong AD-A4 bảng A vs B).
- **Bcrypt cost=12, JWT HS256 TTL 24h, không refresh** — kế thừa AD-2 khung, không đổi.
- **Rate-limit chỉ áp `POST /api/auth/login`** (không toàn cục `/api/*`), `skipSuccessfulRequests:true` để không chặn user gõ lộn vài lần.
- **Seed admin trong migration `m003`**, không dùng script `npm run seed` riêng → mọi máy dev/prod đều có admin ngay sau `npm start` đầu tiên.
- **CORS siết `origin` theo env `CORS_ORIGIN`** (default `http://localhost:5173`), `credentials:true`.

## Handoff Payload — bước sau đọc phần này

- **do_not_redo**: ADR đầy đủ tại `docs/architecture/ADR-auth-labeling-studio.md` — bước 2.2 KHÔNG viết lại thiết kế mà đọc + bám để code. Không cần chạy lại STRIDE/OWASP ở giai đoạn thiết kế (nhưng vẫn phải chạy security-audit-stride trên CODE thực tế trước merge 2.2). CTO+EM đã APPROVED.
- **watch_out**:
  1. 5 warning MED trong §6.3 PHẢI có test tương ứng ở 2.2 — không được implement mà thiếu (điều kiện CTO #A1 bao gồm cả case 403).
  2. Điều kiện CTO #A2: chạy `npm audit --production` trước commit cuối 2.2, no Critical/High trên 5 package: `bcrypt`, `jsonwebtoken`, `cookie-parser`, `helmet`, `express-rate-limit`.
  3. `bcrypt` native build có thể fail trên Windows — có fallback `bcryptjs` (chậm ~30%), ghi chú trong TDD nếu phải đổi.
  4. `.env` và `server/data/.jwt-secret.dev` PHẢI thêm vào `.gitignore` TRƯỚC commit đầu tiên của 2.2.
  5. Migration `m003_add_users()` là idempotent + tự seed admin — không tạo endpoint `POST /api/setup` riêng.
  6. Prod: `AUTH_JWT_SECRET` thiếu → server refuse start (exit 1). Dev: sinh secret + log warning, ghi vào `server/data/.jwt-secret.dev`.
  7. TOÀN BỘ `/api/*` yêu cầu auth (kể cả GET), trừ `/api/auth/login` và `/api/health` — bước 2.2 phải cập nhật client (`AuthContext` + fetch wrapper gắn credentials) để không vỡ UI. Order middleware trong `index.js`: helmet → cors → json → cookieParser → rateLimit(login) → authRouter → authRequired → routers hiện có.
  8. `DELETE /api/users/:id` là soft-delete (set `is_active=0`) khi user có FK trong `annotation_history`/`activity_log`. Chỉ hard-delete khi chưa có FK.
- **next_inputs**:
  - ADR chính: `docs/architecture/ADR-auth-labeling-studio.md` — §3 (8 AD-A) là spec code, §6 là checklist test, §7 §8 là điều kiện merge.
  - TDD §4 (auth) `docs/tech-design/TDD-labeling-studio-improve.md` — vẫn valid, ADR này chỉ cụ thể hoá thêm.
  - Bảng `users` phải có trước Phase 3 (đã ghi PLAN-MASTER quyết định #1).
  - Package cần thêm vào `server/package.json`: `bcrypt ^5`, `jsonwebtoken ^9`, `cookie-parser ^1`, `helmet ^7`, `express-rate-limit ^7`.
  - Env mới `server/.env.example` cần tạo với các key: `AUTH_JWT_SECRET`, `AUTH_BOOTSTRAP_ADMIN_USER`, `AUTH_BOOTSTRAP_ADMIN_PASSWORD`, `AUTH_COOKIE_SECURE`, `CORS_ORIGIN`.

## Commit

- Hash: [điền sau khi commit]
- Đã push: [có/không]

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

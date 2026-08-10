---
step: "0.2"
plan: ../PLAN-MASTER.md
agent: tech-lead
status: done
completed_at: "2026-08-04 11:47"
deps: ["0.1"]
---

# STEP 0.2 — Technical Design Document tổng thể + ADR

## Input nhận

Từ STEP-0.1: `code-graph/CODE-GRAPH.md` (commit 7118fe1) — dùng làm nguồn kiến trúc chính, KHÔNG đọc lại source.

## Nhiệm vụ

Viết TDD tổng thể + ADR chốt 5 điểm kiến trúc mấu chốt cho 22 bước code còn lại: (1) Inference FastAPI, (2) Auth JWT, (3) DB migration Phase 3, (4) Class switcher MRU, (5) Image done status. Tech Lead viết → CTO review & approve trong cùng conversation.

## Definition of Done

- [x] `docs/tech-design/TDD-labeling-studio-improve.md` tạo xong
- [x] Mục "Inference service FastAPI": kiến trúc, port 8001, spawn-by-Node lifecycle, LRU cache 3 model, fallback 503
- [x] Mục "Schema migration plan": SQL đầy đủ cho users/annotation_history/activity_log/jobs/detect_cache + backup + transaction
- [x] Mục "Auth design": JWT HS256, bcrypt cost=12, dual-mode cookie+Bearer, 3 role, seed admin
- [x] Mục "API contracts mới": auth, history, activity, jobs, thumbnails, batch, review
- [x] `docs/architecture/ADR-labeling-studio-improve.md` tạo xong — 10 AD (AD-1 → AD-10) + Alternatives + Consequences
- [x] CTO review + APPROVED kèm 1 điều kiện (verify row count trước/sau migration 3.1)
- [x] DOCX xuất xong cho cả 2 file .md (PDF thất bại do docx2pdf Windows RPC — cùng issue bước 0.1, không block)
- [x] Commit + push lên nhánh `Improve`

## Đã làm

- Viết TDD (`docs/tech-design/TDD-labeling-studio-improve.md`) 13 section: kiến trúc tổng thể, 5 quyết định mấu chốt + API contracts + rủi ro + rollback plan
- Viết ADR (`docs/architecture/ADR-labeling-studio-improve.md`) 10 AD (AD-1 → AD-10) + Alternatives + Consequences + Security posture
- Đóng vai CTO review trong cùng conversation, ghi APPROVED + 1 điều kiện bổ sung (verify count row trước/sau migration 3.1) trực tiếp vào cuối ADR
- Xuất DOCX (2 file OK). PDF thất bại (docx2pdf RPC Windows — đã note ở bước 0.1, không block)
- Commit + push lên nhánh Improve

## Artifact

- `docs/tech-design/TDD-labeling-studio-improve.md` + `.docx` (PDF fail)
- `docs/architecture/ADR-labeling-studio-improve.md` + `.docx` (PDF fail)

## Quyết định quan trọng

1. **Inference service:** FastAPI + uvicorn tại 127.0.0.1:8001; Node quản lý lifecycle (spawn khi start, kill khi shutdown); LRU cache 3 model; fallback 503 (KHÔNG tự spawn infer.py — tránh 2 code path). Giữ infer.py cũ cho rollback qua `USE_LEGACY_INFER=1`.
2. **Auth:** JWT HS256 (24h, không refresh), httpOnly cookie + Bearer dual-mode, bcrypt cost=12, secret bắt buộc qua env, rate-limit 10 lần/15 phút. 3 roles: annotator/reviewer/admin. Seed admin qua env `AUTH_BOOTSTRAP_ADMIN_*`.
3. **users.id = INTEGER AUTOINCREMENT** (khác các bảng cũ TEXT nanoid) — FK actor_id/completed_by đồng nhất INTEGER; bảng cũ giữ nguyên TEXT.
4. **Migration strategy:** Giữ pattern idempotent (PRAGMA table_info + ALTER TABLE) nhưng tách file `server/src/migrations.js`; backup auto `.db.bak-{ts}` giữ 5 gần nhất; wrap transaction.
5. **Annotation history:** SNAPSHOT toàn bộ annotations của ảnh sau mỗi save (KHÔNG diff). Cột `annotations.version` cho optimistic locking (409 khi mismatch). Retention 200 version/ảnh.
6. **Image done:** 2 field độc lập `completed_at` + `completed_by`, KHÔNG đổi enum `status`. Endpoint reuse PATCH `/api/projects/:pid/images/:iid` body `{completed}`.
7. **Class switcher:** MRU lưu **localStorage** per-user per-project (không DB); Ctrl+K fuzzy subsequence tự viết; `classes.hotkey` mở rộng 1-2 ký tự (chỉ sửa validation).
8. **Jobs persist:** bảng `jobs` (TEXT nanoid PK để tương thích client), autolabel refactor DB thay Map; contract client KHÔNG đổi.
9. **Fan-out inference:** Node chia 32 ảnh/request `POST /predict`, cập nhật `jobs.done` sau mỗi batch; UI vẫn poll qua endpoint autolabel cũ.
10. **CTO condition #1:** bước 3.1 thực thi PHẢI verify row count trước/sau migration; không merge nếu thiếu bước verify.

## Handoff Payload — bước sau đọc phần này (chỉ phần này, không cần đọc "Đã làm")

- do_not_redo: KHÔNG cần khảo sát lại kiến trúc, KHÔNG cần chọn lại framework/auth scheme/migration tool. Mọi quyết định kiến trúc đã chốt trong TDD + ADR (10 AD). Các bước 1.1–6.3 CHỈ implement theo spec đó — nếu thấy cần đổi thiết kế phải update TDD + bump `updated` frontmatter trước khi code.
- watch_out: (1) `users.id` là INTEGER AUTOINCREMENT (không phải TEXT nanoid như bảng cũ) — mọi FK actor_id/completed_by/updated_by/actor_id trong jobs đều INTEGER. (2) Migration MỚI tách file `server/src/migrations.js` — bước 1.2/2.2/3.1/3.5/4.1/6.1 đều đăng ký function ở đây, KHÔNG viết inline trong db.js. (3) Bước 3.1 BẮT BUỘC verify row count trước/sau migration (CTO condition #1) — không merge nếu thiếu. (4) Inference service fallback = 503 (KHÔNG spawn infer.py cũ); rollback qua env `USE_LEGACY_INFER=1`. (5) `AUTH_JWT_SECRET` env bắt buộc ≥ 32 ký tự — server refuse start nếu thiếu; seed admin qua env `AUTH_BOOTSTRAP_ADMIN_USER`/`AUTH_BOOTSTRAP_ADMIN_PASSWORD`. (6) Migration Auth (Phase 2) PHẢI chạy trước Phase 3 vì FK sang users.id. (7) Autolabel refactor giữ shape response cũ — client `startAutoLabel`/`getAutoLabelJob` KHÔNG đổi. (8) PDF export tiếp tục thất bại do docx2pdf Windows RPC — bước sau không cần thử lại nếu chỉ cần DOCX.
- next_inputs: `docs/tech-design/TDD-labeling-studio-improve.md` (đọc §3 cho bước 1.1; §5 cho 1.2/3.1/3.5/4.1/6.1; §4 cho 2.x; §6 cho 5.5; §7 cho 3.5; §8 cho tất cả API mới). `docs/architecture/ADR-labeling-studio-improve.md` (đọc AD tương ứng khi cần lý do quyết định). Phase 1 (1.1/1.2/1.3) chạy song song được — cùng độc lập, không đụng auth/schema Phase 2-3.

## Commit

- Hash: edc2335
- Đã push: có (origin/Improve)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

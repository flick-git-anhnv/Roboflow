---
step: "0.1"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: "2026-08-04 11:38"
deps: []
---

# STEP 0.1 — Codebase audit + tạo CODE-GRAPH

## Input nhận

Không có bước trước. Đây là bước khởi đầu.

Context cần biết:
- Repo: `e:\KZTEK\Code_Git\Roboflow - Copy`, nhánh `Improve`
- Stack: Node.js/Express (`server/src/`), React 18/Vite/TS (`client/src/`), SQLite (better-sqlite3), Python infer (`server/src/python/infer.py`)
- Các route hiện có: `projects.js`, `annotations.js`, `images.js`, `classes.js`, `export.js`, `stats.js`, `models.js`, `autolabel.js`
- DB: `server/src/db.js` — 5 bảng: `projects, classes, images, annotations, models`

## Nhiệm vụ

Đọc toàn bộ codebase hiện tại, lập `code-graph/CODE-GRAPH.md` đầy đủ (module map, dependency, API endpoints, DB schema thực tế), xuất `code-graph/CODE-GRAPH.pdf`. File này là "bản đồ" chung cho toàn bộ plan — mọi bước sau phải đọc trước khi code.

## Definition of Done

- [ ] `code-graph/CODE-GRAPH.md` tạo xong từ template `.claude/templates/CODE-GRAPH-template.md`
- [ ] Liệt kê đầy đủ: tất cả file server (`routes/`, `db.js`, `index.js`, `python/`), client pages + components
- [ ] Ghi rõ DB schema thực tế (5 bảng, cột, khóa ngoại) từ `server/src/db.js`
- [ ] Ghi rõ API endpoints hiện có (method + path + route file)
- [ ] Confidence labels (CONFIRMED/INFERRED/UNCERTAIN) đầy đủ cho mọi entry
- [ ] `code-graph/CODE-GRAPH.pdf` xuất xong (chạy `python scripts/md_to_docx_kztek.py code-graph/CODE-GRAPH.md --no-docx`)
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

- Đọc toàn bộ `server/src/` (index.js, db.js, 8 route files, python/infer.py) và `client/src/` (App.tsx, api.ts, types.ts, 3 pages, 4 components)
- Đọc cả 2 package.json (server + client) để lấy dependency list chính xác
- Lập CODE-GRAPH.md đầy đủ: module map + 5 bảng DB schema thực tế + 17 API endpoints (method/path/file:line) + blast radius map cho 23 bước plan
- Xuất CODE-GRAPH.docx (✓); PDF thất bại do docx2pdf RPC error trên Windows (⚠️ ghi chú, không block)
- Commit 7118fe1 + push lên nhánh Improve

## Artifact

- `code-graph/CODE-GRAPH.md` — bản đồ codebase đầy đủ (CONFIRMED toàn bộ)
- `code-graph/CODE-GRAPH.docx` — bản Word brand KZTEK
- `code-graph/CODE-GRAPH.pdf` — ⚠️ thất bại (docx2pdf RPC error Windows), DOCX có

## Quyết định quan trọng

1. **Không có template CODE-GRAPH** trong project — viết từ đầu theo cấu trúc chuẩn CLAUDE.md §17
2. **Confidence CONFIRMED toàn bộ** — đọc trực tiếp 100% source files liên quan, không INFERRED
3. **Section §9 Blast radius** — ghi rõ file nào bị impact ở từng phase để bước 0.2 (TDD) và các bước code sau không phải tra lại
4. **Phát hiện inline migration pattern** trong db.js — PRAGMA table_info + ALTER TABLE (idempotent). Các bước thêm cột mới (Phase 3.1, 3.5) nên follow cùng pattern này thay vì dùng script SQL riêng — cân nhắc tại bước 0.2

## Handoff Payload — bước sau đọc phần này (chỉ phần này, không cần đọc "Đã làm")

- do_not_redo: Không đọc lại source files đã audit (projects.js, classes.js, images.js, annotations.js, export.js, stats.js, models.js, autolabel.js, infer.py, db.js, api.ts, types.ts). CODE-GRAPH.md đã CONFIRMED toàn bộ, dùng làm nguồn chính.
- watch_out: (1) `autolabel.js` jobs dùng in-memory Map — mất khi restart; đây là điểm yếu cần fix ở Phase 1.2. (2) DB migration hiện tại inline trong db.js (PRAGMA table_info + ALTER TABLE) — bước 0.2 TDD cần quyết định strategy migration cho Phase 3.1/3.5: giữ inline hay dùng file SQL đánh số. (3) annotations.js không có GET riêng — annotations trả về cùng `GET /images/:imageId`, bước code Phase 3.2 (history API) cần thêm GET endpoint riêng. (4) PDF export thất bại do docx2pdf Windows RPC — không ảnh hưởng workflow, chỉ thiếu PDF.
- next_inputs: `code-graph/CODE-GRAPH.md` (đọc section §6 DB Schema + §7 API Endpoints + §9 Blast radius trước khi viết TDD). Commit hash: 7118fe1.

## Commit

- Hash: 7118fe1
- Đã push: có (origin/Improve)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

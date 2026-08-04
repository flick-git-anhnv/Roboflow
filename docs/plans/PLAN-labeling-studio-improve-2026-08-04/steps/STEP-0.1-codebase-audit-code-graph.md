---
step: "0.1"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
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

[Điền SAU khi hoàn thành]

## Artifact

[Điền SAU khi hoàn thành]

## Quyết định quan trọng

[Điền SAU khi hoàn thành]

## Handoff Payload — bước sau đọc phần này (chỉ phần này, không cần đọc "Đã làm")

- do_not_redo: Không có
- watch_out: Không có
- next_inputs: Không có

## Commit

- Hash: [điền sau khi commit]
- Đã push: [có/không]

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

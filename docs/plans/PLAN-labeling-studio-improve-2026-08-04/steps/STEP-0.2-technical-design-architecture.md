---
step: "0.2"
plan: ../PLAN-MASTER.md
agent: tech-lead
status: todo
completed_at:
deps: ["0.1"]
---

# STEP 0.2 — Technical Design Document tổng thể + ADR

## Input nhận

Từ STEP-0.1: `code-graph/CODE-GRAPH.md` đầy đủ — đọc trước khi viết TDD.

## Nhiệm vụ

Tech Lead viết TDD tổng thể cho toàn bộ plan cải tiến, bao gồm: (1) kiến trúc inference service FastAPI, (2) schema migration plan chi tiết (migration scripts, rollback plan cho 3.1), (3) auth design sơ bộ (chuẩn bị cho Phase 5), (4) API contract mới cho các feature chính. CTO review và approve ADR trước khi bất kỳ Phase 1+ nào bắt đầu.

## Definition of Done

- [ ] `docs/tech-design/TDD-labeling-studio-improve.md` tạo xong
- [ ] Mục "Inference service FastAPI": mô tả kiến trúc, port, startup/shutdown, cách Node gọi HTTP, fallback khi service down
- [ ] Mục "Schema migration plan": danh sách bảng/cột sẽ thêm, thứ tự migration, backup strategy, rollback script
- [ ] Mục "Auth design sơ bộ": JWT vs session, bảng `users`/`roles`, middleware plan — đủ để CTO review rủi ro bảo mật
- [ ] Mục "API contracts mới": endpoints mới cho history, jobs persist, thumbnails, auth, batch ops
- [ ] `docs/architecture/ADR-labeling-studio-improve.md` tạo xong — ghi rõ quyết định kiến trúc + lý do
- [ ] CTO đọc và approve ADR (ghi rõ "CTO approved" + ngày trong ADR file)
- [ ] DOCX + PDF xuất xong cho cả 2 file .md
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

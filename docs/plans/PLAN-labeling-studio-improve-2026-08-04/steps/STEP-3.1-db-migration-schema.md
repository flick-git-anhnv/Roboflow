---
step: "3.1"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["0.2", "2.2"]
---

# STEP 3.1 — DB Migration: annotation_history, activity_log, version column (với actor_id FK)

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD + ADR tại `docs/tech-design/TDD-labeling-studio-improve.md` — đọc mục "Schema migration plan" chi tiết (backup strategy, rollback script) trước khi viết migration.
Từ STEP-2.2 Handoff Payload: bảng `users` đã tồn tại — `actor_id` trong migration này sẽ FK → `users.id`.

## Nhiệm vụ

> ⚠️ **ĐỤNG SCHEMA HIỆN CÓ — BẮT BUỘC CTO/EM approve + security-audit-stride trước merge.**
> Phase 2 (Auth) PHẢI hoàn thành trước bước này — bảng `users` cần tồn tại cho FK `actor_id`.

Viết và kiểm tra migration scripts cho 3 thay đổi schema:
1. Thêm cột `version INTEGER NOT NULL DEFAULT 1` vào bảng `annotations` hiện có (đang có dữ liệu thực)
2. Tạo bảng mới `annotation_history(id, annotation_id, image_id, version, data_before, data_after, changed_at, actor_id INTEGER REFERENCES users(id))`
3. Tạo bảng mới `activity_log(id, project_id, event_type, detail_json, created_at, actor_id INTEGER REFERENCES users(id))`

Migration phải an toàn: có rollback script, backup DB trước khi chạy.

## Definition of Done

- [ ] `server/migrations/003_add_annotations_version.sql` — `ALTER TABLE annotations ADD COLUMN version INTEGER NOT NULL DEFAULT 1`
- [ ] `server/migrations/003_rollback.sql` — rollback tương ứng (SQLite không hỗ trợ DROP COLUMN trực tiếp → cần recreate table strategy nếu cần)
- [ ] `server/migrations/004_create_annotation_history.sql` — tạo bảng `annotation_history` với `actor_id REFERENCES users(id)` (nullable)
- [ ] `server/migrations/005_create_activity_log.sql` — tạo bảng `activity_log` với `actor_id REFERENCES users(id)` (nullable)
- [ ] `server/src/db.js` — chạy migration scripts khi khởi động (idempotent, kiểm tra đã chạy chưa)
- [ ] **CTO/EM review và approve** migration scripts (ghi rõ "CTO approved: [ngày]" trong file này tại mục "Quyết định quan trọng" trước khi merge)
- [ ] `security-audit-stride` đã chạy và không có Fail nhóm rủi ro cao (kết quả nhúng trong PR description)
- [ ] Test trên DB có dữ liệu thật (copy DB local): migration chạy xong, dữ liệu annotations cũ vẫn nguyên vẹn, cột `version` = 1 cho tất cả row cũ
- [ ] TL review + approve PR
- [ ] QA smoke test: chạy server sau migration, verify tất cả routes hiện có vẫn hoạt động bình thường
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

[Điền SAU khi hoàn thành]

## Artifact

[Điền SAU khi hoàn thành]

## Quyết định quan trọng

[Điền SAU khi hoàn thành — PHẢI ghi rõ CTO approved trước khi merge]

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Không có
- watch_out: Không có
- next_inputs: Không có

## Commit

- Hash: [điền sau khi commit]
- Đã push: [có/không]

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

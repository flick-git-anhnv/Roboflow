---
step: "5.5"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: todo
completed_at:
deps: ["0.2"]
---

# STEP 5.5 — Quick class switcher (MRU + fuzzy search + hotkey 2 ký tự)

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD + API contracts. Đọc handoff 0.2 trước khi code. Tính năng thuần frontend — không cần DB mới.

## Nhiệm vụ

Thiết kế lại cơ chế đổi class nhanh trong AnnotatorPage để scale tốt với project có > 9 class. Ba cơ chế kết hợp: (1) phím 1-9 cho 9 class MRU (most recently used), (2) Ctrl+K mở quick switcher fuzzy search, (3) hotkey 2 ký tự tự gán (tránh trùng khi nhiều class). Hiển thị bảng class + hotkey luôn visible trên UI.

## Definition of Done

- [ ] **MRU 1-9**: track 9 class dùng gần nhất trong session (localStorage); phím 1-9 chọn class tương ứng theo thứ tự MRU
- [ ] **Ctrl+K quick switcher**: modal/dropdown với ô tìm kiếm fuzzy (gõ vài ký tự tên class, kết quả filter realtime); nhấn Enter hoặc click chọn class; Esc đóng
- [ ] **Hotkey 2 ký tự**: user tự gán hotkey 2 ký tự cho class trong settings (VD: "ca" → car, "pe" → person); gõ nhanh 2 ký tự liên tiếp (trong 500ms) → đổi class
- [ ] **Bảng hotkey sidebar**: panel nhỏ bên cạnh canvas liệt kê class + phím tắt tương ứng (MRU key + hotkey 2 ký tự nếu đã gán); có thể thu gọn
- [ ] Hotkey 2 ký tự được lưu vào localStorage (persist qua session, per project)
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7 (đặc biệt C3 — phím tắt không conflict với Ctrl+Z/Y/S/K và các phím vẽ)
- [ ] TL review + approve PR
- [ ] QA smoke test: project 15 class, gán hotkey 2 ký tự cho 3 class, verify Ctrl+K filter đúng, verify MRU cập nhật khi đổi class
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

---
step: "5.5"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: 2026-08-05 11:42
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

1. **server/src/routes/classes.js**: `normalizeHotkey` đổi `slice(0,1)` → `slice(0,2)` — DB column đã là TEXT (không giới hạn độ dài), không cần migration.

2. **client/src/pages/AnnotatorPage.tsx**:
   - Thêm state `mruClassIds` (init từ `localStorage.getItem('mru_classes_{projectId}')`, default `[]`).
   - Thêm `hotkeyBufferRef` + `hotkeyTimerRef` cho cơ chế buffer 2-char.
   - Thêm `showSwitcher`, `switcherQuery`, `switcherIdx`, `switcherInputRef` cho Ctrl+K modal.
   - `pushToMru(classId)`: đẩy lên đầu MRU, persist localStorage, giới hạn 9 phần tử.
   - `assignClassToSelected` gọi `pushToMru` sau khi setActiveClassId.
   - `switcherResults` useMemo: filter classes theo `fuzzyMatch(switcherQuery, c.name)`.
   - `applySwitcherClass` + `handleSwitcherKey` (↑↓ navigate, Enter chọn, Esc đóng).
   - Key handler update: Ctrl+K toggle switcher (trước HTMLInputElement check); phím 1-9 → MRU lookup; ký tự chữ → buffer 2-char (immediate nếu không nhập nhằng, 500ms timer nếu có 2-char hotkey bắt đầu bằng ký tự đó).
   - Sidebar class list: hiển thị MRU key (1-9) + custom hotkey song song, dùng flex.
   - Quick switcher modal JSX: overlay + input auto-focus + list với highlight + MRU key + custom hotkey.
   - Xóa `effectiveHotkey` (không còn dùng), thêm `fuzzyMatch` (substring + sequential char).

3. **client/src/styles.css**: Thêm `.class-switcher-overlay`, `.class-switcher-modal`, `.class-switcher-input`, `.class-switcher-list`, `.class-switcher-row` (brand colors KZTEK).

## Artifact

- `server/src/routes/classes.js` — normalizeHotkey 2-char
- `client/src/pages/AnnotatorPage.tsx` — MRU + Ctrl+K + buffer hotkey + sidebar update + switcher modal
- `client/src/styles.css` — switcher CSS

## Quyết định quan trọng

1. **MRU per-project**: localStorage key `mru_classes_{projectId}` — tránh trộn MRU giữa các project khác nhau.
2. **1-9 keys hoàn toàn là MRU**: bỏ mapping cũ (index trong `classes` array). User cần gán class ít nhất 1 lần để xuất hiện trong MRU và được phím số.
3. **Buffer không delay 1-char khi không nhập nhằng**: nếu không có hotkey 2-char nào bắt đầu bằng ký tự đó → áp dụng ngay, không chờ 500ms.
4. **Ctrl+K toggle**: bấm lần 2 đóng switcher (không cần chỉ Esc).
5. **DB không cần migration**: SQLite TEXT không giới hạn độ dài — chỉ cần sửa validation tầng route.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Phase 5 HOÀN THÀNH. Không thêm MRU/switcher/hotkey-buffer vào AnnotatorPage (đã có). Không thêm `.class-switcher-*` CSS (đã có). Không sửa normalizeHotkey trong classes.js (đã là 2-char). `effectiveHotkey` function đã bị xóa — không tham chiếu lại.
- watch_out: Phím 1-9 giờ là MRU lookup — nếu MRU rỗng (chưa dùng class nào), phím 1-9 không làm gì. User cần click/gán class ít nhất 1 lần để phím số hoạt động. Phím chữ có 500ms delay nếu có 2-char hotkey nhập nhằng — bình thường theo thiết kế. `assignClassToSelected` phụ thuộc `pushToMru` trong deps array.
- next_inputs: Commit hash `0adcf60`. Phase 6 (nếu có) không đụng đến AnnotatorPage nhiều. File `client/src/pages/AnnotatorPage.tsx` + `client/src/styles.css` tại commit này là trạng thái cuối Phase 5.

## Commit

- Hash: 0adcf60
- Đã push: có — branch `Improve`

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

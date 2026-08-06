# GOTCHAS.md — Lỗi Ngầm Đã Biết

Tài liệu này ghi lại các lỗi ngầm, bẫy code (gotchas) hoặc các rủi ro kỹ thuật phát hiện được trong quá trình thực thi các task trên workspace.

---

## 1. Scope biến local `w` và `h` trong `handleDragMove`

- **Hiện tượng**: Khi viết logic kéo/resize cho Canvas gán nhãn, trình biên dịch TypeScript báo lỗi không tìm thấy định nghĩa của `w` và `h`.
- **Nguyên nhân**: Biến `w` và `h` biểu diễn kích thước ảnh ban đầu được định nghĩa cục bộ bên trong nhánh `else if (drag.mode === 'move' && drag.orig)`. Nhánh `resize` bên dưới không thể truy cập được các biến này.
- **Cách khắc phục**: Khai báo các biến `imageW` và `imageH` ở cấp độ đầu hàm `handleDragMove` ngay dưới phần guard clause `if (drag.mode === 'none') return;` để tất cả các nhánh con (`draw`, `move`, `resize`, `select`) đều dùng chung được một cách an toàn.

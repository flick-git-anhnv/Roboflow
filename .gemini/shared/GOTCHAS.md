# GOTCHAS.md — Lỗi Ngầm Đã Biết

Tài liệu này ghi lại các lỗi ngầm, bẫy code (gotchas) hoặc các rủi ro kỹ thuật phát hiện được trong quá trình thực thi các task trên workspace.

---

## 1. Scope biến local `w` và `h` trong `handleDragMove`

- **Hiện tượng**: Khi viết logic kéo/resize cho Canvas gán nhãn, trình biên dịch TypeScript báo lỗi không tìm thấy định nghĩa của `w` và `h`.
- **Nguyên nhân**: Biến `w` và `h` biểu diễn kích thước ảnh ban đầu được định nghĩa cục bộ bên trong nhánh `else if (drag.mode === 'move' && drag.orig)`. Nhánh `resize` bên dưới không thể truy cập được các biến này.
- **Cách khắc phục**: Khai báo các biến `imageW` và `imageH` ở cấp độ đầu hàm `handleDragMove` ngay dưới phần guard clause `if (drag.mode === 'none') return;` để tất cả các nhánh con (`draw`, `move`, `resize`, `select`) đều dùng chung được một cách an toàn.

## 2. Lỗi SQLite FOREIGN KEY Constraint khi xoá User (DELETE /api/users/:id)

- **Hiện tượng**: Khi admin thực hiện xoá tài khoản user, hệ thống báo lỗi cơ sở dữ liệu `SqliteError: FOREIGN KEY constraint failed` và không thể xoá/vô hiệu hoá tài khoản.
- **Nguyên nhân**: Bảng `users` được liên kết bằng khoá ngoại với các cột `uploaded_by`, `reviewed_by`, `completed_by`, `assigned_to` trong bảng `images`, và cột `actor_id` trong `activity_log`. Logic xoá cũ chỉ kiểm tra `annotation_history` nên bỏ sót các bảng này, khiến database chặn việc xoá cứng.
- **Cách khắc phục**:
  1. Kiểm tra khoá ngoại ở tất cả các bảng liên quan (`annotation_history`, `images`, `activity_log`).
  2. Nếu tồn tại liên kết, chuyển sang chế độ soft-delete (thiết lập `is_active = 0`).
  3. Bọc câu lệnh `DELETE` trong khối `try-catch` để bắt lỗi `SQLITE_CONSTRAINT` và tự động fallback sang soft-delete nếu có liên kết ẩn nào khác.

## 3. SQLite JSON Serialization double-escaping in `json_group_array`

- **Hiện tượng**: Khi gộp nhóm các annotations bằng hàm `json_group_array(json_object('id', a.id, 'points', a.points))` trong truy vấn ảnh, trường `points` (lưu trữ dưới dạng chuỗi JSON thô trong database) bị Express trả về dưới dạng chuỗi thoát ký tự (escaped string - ví dụ: `"\"[{\\\"x\\\":10,...}]\""`) thay vì một mảng JSON thực tế.
- **Nguyên nhân**: SQLite coi trường `points` là kiểu TEXT thông thường. Khi đưa vào `json_object`, SQLite không tự động parse chuỗi TEXT đó thành JSON mà chỉ serialize nó thành một JSON String.
- **Cách khắc phục**: Sử dụng hàm `json(a.points)` bao quanh trường `points` trong câu truy vấn `json_object` (ví dụ: `json_object('id', a.id, 'points', json(a.points))`). Điều này báo cho SQLite biết chuỗi TEXT đó là một cấu trúc JSON hợp lệ và cần được nhúng trực tiếp làm mảng/đối tượng JSON thực tế.

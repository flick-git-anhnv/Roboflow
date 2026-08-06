# STEP-1: Thiết kế & Thực thi Import Classes (Cập nhật)

## Mô tả giải pháp
Bổ sung tính năng cho phép người dùng nhập nhanh danh sách class hàng loạt bằng cách đọc tệp YOLO `data.yaml` hoặc sao chép từ một dự án khác.

## Cập nhật thiết kế chi tiết:

### 1. Tự động gán Hotkey khi tạo/import nhãn
Hệ thống sẽ tự động gán hotkey (phím tắt truy cập nhanh) khi một nhãn được tạo mới hoặc import vào dự án:
- Nếu tên nhãn dài 1-2 ký tự (VD: "0", "1", "lp") và chưa được sử dụng làm hotkey -> Dùng chính tên nhãn.
- Nếu không, thử dùng ký tự đầu tiên của tên nhãn (VD: "c" cho "car").
- Nếu đã trùng, thử dùng 2 ký tự đầu tiên của tên nhãn (VD: "ca" cho "cat").
- Nếu vẫn trùng, để trống (`null`).
Logic này được tích hợp ở phía server trong mọi API tạo hoặc import class.

### 2. Xóa tất cả nhãn của dự án
- Bổ sung endpoint `DELETE /api/projects/:projectId/classes` trên backend để xóa toàn bộ nhãn của dự án hiện tại, đồng thời xóa các annotation tương ứng (CASCADE) trong DB, và ghi nhận sự kiện vào `activity_log`.
- Thêm nút bấm màu đỏ "Xóa tất cả nhãn" trong `ClassManagerPanel.tsx` kèm hộp thoại cảnh báo xác nhận.

### 3. Tự động bôi đen Hotkey khi được nhấp (Focus)
- Thay đổi sự kiện `onFocus` của các ô nhập hotkey (phím tắt) trong `ClassManagerPanel.tsx`: gọi `e.target.select()` để bôi đen toàn bộ giá trị hiện tại. Nhờ đó khi người dùng nhấn phím khác sẽ ghi đè lên ngay lập tức, tránh hiện tượng append phím (ví dụ sửa "A" thành "AB" khi gõ "B").

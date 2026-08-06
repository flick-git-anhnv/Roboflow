# Original User Request

## Initial Request — 2026-08-06T01:21:49Z

<USER_REQUEST>
# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

Nâng cấp toàn diện ứng dụng Roboflow: tái thiết kế UI hiện đại (animations, dark mode, responsive), bổ sung tính năng Dashboard/báo cáo và tối ưu hóa/refactor Frontend & Backend.

Working directory: e:\KZTEK\Code_Git\Roboflow - Copy
Integrity mode: benchmark

## Requirements

### R1. Version Control & Isolation
Tạo nhánh git mới trước khi bắt đầu công việc để đảm bảo an toàn cho nhánh hiện hành.

### R2. UI/UX Redesign
Tái thiết kế giao diện người dùng theo phong cách hiện đại. Áp dụng dark mode (hoặc theme hài hoà), thêm micro-animations và đảm bảo giao diện responsive. Không có file Figma nên nhóm hãy tự quyết định thiết kế sao cho đẹp và chuyên nghiệp.

### R3. Feature Expansion (Dashboard & Reports)
Xây dựng trang Dashboard tổng quan và các tính năng báo cáo/quản lý để nâng cao trải nghiệm người dùng. 

### R4. Performance & Refactoring
Tối ưu hóa và refactor mã nguồn cả Client và Server.

### R5. Database Schema Changes
Nếu có thay đổi cấu trúc database, bắt buộc phải tạo các script/file migration đầy đủ.

### R6. Verification & Testing
Nhóm agent phải tự kiểm thử bằng cách khởi chạy ứng dụng thật và đọc log. Bắt buộc phải viết thêm Unit Test hoặc E2E Test cho các tính năng mới được tạo ra.

## Acceptance Criteria

### UI/UX & Tính năng
- [ ] Ứng dụng hiển thị đúng (không vỡ layout) trên mobile và desktop.
- [ ] Chuyển đổi theme (dark/light) thành công.
- [ ] Trang Dashboard hoạt động, hiển thị được biểu đồ/dữ liệu từ Backend.

### Hiệu năng & Code
- [ ] Thời gian tải trang nhanh, không hiển thị các cảnh báo chậm (slow warnings) ở console trình duyệt hoặc log server.
- [ ] Các tính năng mới phải đi kèm Unit Test hoặc E2E Test chạy pass.
- [ ] Mọi thay đổi về database đều có file/script migration tương ứng chạy thành công.
- [ ] Toàn bộ thay đổi phải được commit trên một nhánh git mới.
- [ ] Khởi chạy ứng dụng Frontend và Backend thành công, không crash.
</USER_REQUEST>

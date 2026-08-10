# STEP-1: Thiết kế & Thực thi nhiều loại gắn nhãn dự án

## Mô tả giải pháp
Hỗ trợ nhiều loại gắn nhãn (Bounding Box, Quad Polygon, Image Classification, Text Recognition) khi tạo Project. Tùy chỉnh giao diện gán nhãn bên trong tương ứng và cập nhật chức năng xuất dữ liệu (export dataset) phù hợp.

## Thiết kế chi tiết:

### 1. Cơ sở dữ liệu & API
- **SQL Migration**: Tạo file `003_add_project_label_type.sql` trong `server/migrations/` để thêm:
  - Cột `label_type` vào bảng `projects` (mặc định `'bbox'`).
  - Cột `text_content` vào bảng `annotations` (mặc định `NULL`).
- **Project Endpoints**:
  - `POST /api/projects`: Chấp nhận `label_type` từ request body để lưu khi tạo mới.
  - `PATCH /api/projects/:id`: Chấp nhận `label_type` để cho phép cập nhật.
- **Annotations Endpoints**:
  - `PUT /api/images/:imageId/annotations`: Lưu trường `text_content` từ danh sách annotation gửi lên.

### 2. Xuất dữ liệu (Exporters)
Trong `server/src/routes/export.js`, căn cứ vào `project.label_type`:
- **`classify` (Image Classification)**: Tạo cấu trúc thư mục chứa các thư mục con theo tên nhãn lớp (`images/${split}/${className}/${filename}`) kèm file `metadata.csv` liệt kê tất cả các ảnh và nhãn phân loại tương ứng.
- **`text_rec` (Text Recognition)**: Tạo tệp `gt.txt` (Ground Truth) trong mỗi phân mục split (train/valid/test) có cấu trúc `images/${split}/${filename}\t${text_content}` phù hợp để train PaddleOCR/CRNN.
- **`bbox` & `quad`**: Giữ nguyên cơ chế xuất YOLO, COCO, VOC hiện tại.

### 3. Giao diện người dùng (Frontend)
- **Tạo Project**: Thêm dropdown `<select>` chọn loại gắn nhãn khi tạo project mới.
- **Annotator Page**:
  - Tải thông tin project để biết loại gán nhãn (`label_type`).
  - **Dự án Classify**: Hiển thị danh sách các nhãn (classes) dưới dạng các nút bấm lớn (Chips). Bấm vào nhãn sẽ tự động tạo nhãn phân loại và chuyển ngay sang ảnh tiếp theo. Canvas vẽ hình sẽ bị ẩn đi.
  - **Dự án Text Rec**: Hiển thị ô nhập văn bản lớn dưới ảnh kèm phím tắt Enter để lưu và tự động chuyển ảnh kế tiếp. Canvas vẽ hình sẽ bị ẩn đi.

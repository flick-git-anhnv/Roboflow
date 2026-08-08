# PLAN-MASTER: Roboflow Advanced Features (M1 - AI Smart Annotation & Auto-Labeling)

## 1. Mục tiêu
Triển khai Milestone 1 (M1) trong lộ trình nâng cấp KZTEK Roboflow theo phong cách Roboflow thật:
1. **Database Migration (`004_roboflow_advanced_features.sql`)**: Tạo các bảng `dataset_versions`, `model_train_jobs`, `cv_workflows` và bổ sung các trường phục vụ Auto-labeling (`images.auto_label_status`, `annotations.source`).
2. **Server Backend API (`server/src/routes/autoLabel.js`)**: Triển khai các endpoint API hỗ trợ AI Auto-labeling (SAM 1-click polygon coordinate generator & Grounding DINO text-prompt auto labeling queue/mock engine).
3. **Client Smart Annotator UI (`client/src/pages/annotator/`)**: Tích hợp nút `Smart Polygon (SAM)` & `Auto-Label Prompt` trên thanh công cụ Canvas, hiển thị khoanh vùng gợi ý và quản lý phân loại nhãn Manual / AI-Auto.
4. **Dataset Health Check Widget**: Hiển thị cảnh báo mất cân bằng class và tỉ lệ ảnh chưa gán nhãn trong Project Dashboard.

---

## 2. Danh sách Task Chi Tiết

### Phase 1: Database Migration & Schema
- [x] Tạo file migration `server/migrations/004_roboflow_advanced_features.sql`
- [ ] Chạy migration engine (`node server/src/migrate.js`) kiểm tra tính hợp lệ.

### Phase 2: Server API & Auto-Label Service
- [ ] Xây dựng `server/src/routes/autoLabel.js` tích hợp các route REST APIs.
- [ ] Đăng ký route mới vào `server/src/app.js`.

### Phase 3: Client Canvas Smart Tools
- [ ] Cập nhật `ThemeContext` / Canvas Toolbar với công cụ `Smart Polygon (SAM)` và `Auto-Label Prompt Modal`.
- [ ] Bổ sung badge phân biệt `🟢 Manual` vs `🟣 AI Auto` kèm nút Quick Approve / Reject.

### Phase 4: Verification & Tests
- [ ] Chạy Unit & Integration Tests cho API Auto-Label & Migration.
- [ ] Chạy E2E verification test suite.

---
task: multiple-label-types
created: 2026-08-07
updated: 2026-08-07 08:30
status: in_progress
workflow: WF-FEATURE
priority: P2
---

# PLAN MASTER: Hỗ trợ nhiều loại gắn nhãn dự án (BBox, Quad, Classify, Text Rec)

> File này chứa tổng quan và trạng thái thực hiện các bước cho tính năng nhiều loại gắn nhãn.

## Mô tả
Thêm lựa chọn loại gắn nhãn (Bounding Box, Quad Polygon, Image Classification, Text Recognition) khi tạo Project. Điều chỉnh giao diện gắn nhãn bên trong tương ứng và cập nhật chức năng xuất dữ liệu (export dataset) phù hợp cho từng loại dự án.

## Quy trình (Workflow)
Áp dụng **WF-FEATURE**:
- **Bước 1 (TL/SD)**: Thiết kế giải pháp kỹ thuật, API và UI.
- **Bước 2 (SD)**: Viết SQL migration và cập nhật backend endpoints, logic xuất file.
- **Bước 3 (SD/JD)**: Cập nhật frontend: form tạo project, API call và trang gán nhãn Annotator.
- **Bước 4 (TL/QA)**: Chạy test và xác minh chức năng.

---

## Các bước chi tiết

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 1 | Lập kế hoạch & Thiết kế chi tiết | tech-lead | ✅ | `steps/STEP-1-design-and-implementation.md` | 2026-08-07 08:30 |
| 2 | Code Backend: Migration, Endpoints & Exporters | senior-developer | ✅ | `steps/STEP-1-design-and-implementation.md` | 2026-08-07 08:34 |
| 3 | Code Frontend UI: Project creation & Annotator UI | junior-developer | ✅ | `steps/STEP-1-design-and-implementation.md` | 2026-08-07 08:40 |
| 4 | Test & Verify | qa-engineer | ✅ | `steps/STEP-1-design-and-implementation.md` | 2026-08-07 08:43 |

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done

---
task: import-classes
created: 2026-08-06
updated: 2026-08-06 20:55
status: completed
workflow: WF-FEATURE
priority: P2
---

# PLAN MASTER: Import Classes / Nhãn từ YOLO YAML hoặc Project khác

> File này chứa tổng quan và trạng thái thực hiện các bước cho tính năng Import Classes.

## Mô tả
Hỗ trợ import nhanh lượng lớn classes bằng cách đọc tệp YOLO `data.yaml` ở máy khách/máy chủ hoặc sao chép nhanh classes từ dự án khác có sẵn.

## Quy trình (Workflow)
Áp dụng **WF-FEATURE** (rút gọn):
- **Bước 1 (TL/SD)**: Thiết kế giải pháp kỹ thuật, API và UI.
- **Bước 2 (SD)**: Viết code backend endpoint (`classes.js`) và frontend client API (`api.ts`).
- **Bước 3 (JD)**: Viết Component UI `ClassImportModal` & nút bấm kích hoạt.
- **Bước 4 (TL/QA)**: Chạy test và xác minh chức năng.

---

## Các bước chi tiết

| # | Bước | Agent | Status | Step file | Hoàn thành lúc |
|---|------|-------|--------|-----------|-----------------|
| 1 | Lập kế hoạch & Thiết kế chi tiết | tech-lead | ✅ | `steps/STEP-1-design-and-implementation.md` | 2026-08-06 20:42 |
| 2 | Code Backend Endpoints | senior-developer | ✅ | `steps/STEP-1-design-and-implementation.md` | 2026-08-06 20:43 |
| 3 | Code Frontend UI Components | junior-developer | ✅ | `steps/STEP-1-design-and-implementation.md` | 2026-08-06 20:43 |
| 4 | Test & Verify (Chạy đầu tiên) | qa-engineer | ✅ | `steps/STEP-1-design-and-implementation.md` | 2026-08-06 20:47 |
| 5 | Bổ sung: Auto hotkey, Delete All & Auto-select | senior-developer | ✅ | `steps/STEP-1-design-and-implementation.md` | 2026-08-06 20:57 |

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done

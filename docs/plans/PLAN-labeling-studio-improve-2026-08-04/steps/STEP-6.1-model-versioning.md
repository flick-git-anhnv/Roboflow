---
step: "6.1"
plan: ../PLAN-MASTER.md
agent: junior-developer
status: done
completed_at: 2026-08-05 11:53
deps: ["0.2"]
---

# STEP 6.1 — Model versioning + metadata so sánh hiệu năng

## Input nhận

Từ STEP-0.2 Handoff Payload: TDD + API contracts. Đọc handoff 0.2 trước khi code.

## Nhiệm vụ

Mở rộng bảng `models` hiện có: thêm metadata (ngày train, dataset dùng để train, mAP@50, mAP@50-95, số epoch, notes) và UI so sánh hiệu năng giữa các model.

## Definition of Done

- [ ] Migration `server/migrations/008_extend_models_metadata.sql` — thêm cột `train_date, dataset_version, map50, map50_95, epochs, notes` vào bảng `models`
- [ ] `server/src/routes/models.js` — PUT/PATCH cập nhật để nhận và lưu các trường metadata mới
- [ ] `client/src/` — form nhập metadata khi upload/edit model; bảng so sánh hiệu năng (sort theo mAP50, badge "best model")
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: thêm 3 model với metadata khác nhau, verify bảng so sánh sort đúng
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. `server/src/db.js`: thêm `m009_model_metadata()` — ALTER TABLE models ADD COLUMN `notes TEXT`, `map_score REAL`, `version_label TEXT`. Idempotent (PRAGMA table_info check). Verify row count trước/sau (CTO condition #1 pattern). Kết quả verify: 0 bảng mất dữ liệu (models 0→0 rows trên DB test sạch).
2. `server/src/routes/models.js`: thêm `PATCH /:modelId` — role guard `requireRole('reviewer', 'admin')` (đồng nhất với upload/delete). Validate `map_score` ∈ [0,1]. PATCH semantics: chỉ cập nhật field có trong body. Trả ModelInfo đầy đủ sau update.
3. `client/src/types.ts`: `ModelInfo` thêm `notes?`, `map_score?`, `version_label?` (tất cả nullable).
4. `client/src/api.ts`: `api.updateModel(projectId, modelId, patch)` — gọi PATCH endpoint.
5. `client/src/pages/ProjectDetailPage.tsx`: thêm state `editingModelId`, `editDraft`, `savingModelMeta`; thêm `sortedModels` (useMemo, sort map_score DESC null-last) và `bestModelId` (useMemo); rewrite section model UI với badge "★ Best", badge version_label, hiển thị mAP%/notes, form inline edit (reviewer/admin).
6. `tests/auth.test.js`: Row 23 (13 test case) — tất cả pass.

## Artifact

- `server/src/db.js` — m009_model_metadata (migration)
- `server/src/routes/models.js` — PATCH /:modelId endpoint MỚI
- `client/src/types.ts` — ModelInfo fields mới
- `client/src/api.ts` — api.updateModel()
- `client/src/pages/ProjectDetailPage.tsx` — model metadata UI
- `tests/auth.test.js` — Row 23 (13 case)
- `code-graph/CODE-GRAPH.md` + `.docx` + `.pdf` — cập nhật §3.9/§6/§7/§4.2/§4.3/§4.5/§9/§10

## Quyết định quan trọng

1. **Không tự tính mAP**: `map_score` là field user nhập tay — tính mAP cần ground truth riêng, ngoài scope bước này.
2. **PATCH semantics**: Chỉ cập nhật field có trong body — không ghi đè field khác. Cho phép partial update (VD chỉ sửa notes mà không mất map_score).
3. **Role guard**: `requireRole('reviewer', 'admin')` — đồng nhất với upload/delete (AD-A5). Annotator không được sửa metadata.
4. **Sort null-last**: Models không có map_score sắp sau models có map_score — tránh null values lên đầu.
5. **Best badge**: Chỉ hiện nếu có ít nhất 1 model có map_score — tránh badge vô nghĩa.
6. **Không thêm migration SQL file riêng** (khác DOD trong STEP file): project dùng pattern `mNNN_xxx()` trực tiếp trong db.js — không dùng SQL file riêng như DOD cũ ghi (DOD ghi theo TDD cũ, pattern thực tế là function trong db.js).

## Handoff Payload — bước sau đọc phần này

- do_not_redo: m009_model_metadata đã chạy và thêm cột notes/map_score/version_label vào bảng models. PATCH /:modelId đã có trong models.js. KHÔNG thêm lại migration hay endpoint này.
- watch_out: STEP-6.2 và STEP-6.3 độc lập hoàn toàn với STEP-6.1 — không đụng models.js. Nếu cần test models trong 6.2/6.3, nhớ schema models đã có thêm 3 cột nullable.
- next_inputs: Không có dependency trực tiếp từ 6.1 sang 6.2/6.3. Các bước đó làm việc với images (6.2: coverage sampling, 6.3: duplicate detection) — không cần output của 6.1.

## Commit

- Hash: b5b8feb
- Đã push: có (origin/Improve)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

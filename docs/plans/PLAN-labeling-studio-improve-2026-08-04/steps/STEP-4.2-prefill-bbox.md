---
step: "4.2"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: 2026-08-05 10:51
deps: ["1.1", "4.1"]
---

# STEP 4.2 — Prefill bbox tự động khi mở ảnh chưa label

## Input nhận

Từ STEP-4.1 Handoff Payload: detect cache đã hoạt động. Đọc handoff 4.1 trước khi code.

## Nhiệm vụ

Khi người dùng mở ảnh chưa có annotation nào, client tự gọi detect để gợi ý bbox trước — hiển thị dưới dạng annotation nháp (style khác biệt). Người dùng accept/reject/sửa từng box, không save tự động. Backend dùng detect cache (4.1) nếu có.

## Đã làm

1. **Migration m008** (`server/src/db.js`): Thêm cột `default_model_id TEXT` vào bảng `projects`. Migration idempotent (kiểm tra PRAGMA table_info trước), verify row count trước/sau để phát hiện data loss.

2. **Route mới** (`server/src/routes/prefill.js`):
   - `GET /images/:imageId/prefill`: kiểm tra annotation có sẵn → trả 200+[] nếu đã có annotation; kiểm tra `default_model_id` → 422 NO_DEFAULT_MODEL nếu chưa set; cache hit → filter by PREFILL_DEFAULT_CONF=0.4 → trả suggestions; cache miss → gọi inference service → save cache → trả suggestions.
   - `PATCH /default-model`: reviewer/admin đặt/bỏ model mặc định cho project (`{ model_id: string|null }`).
   - Helper functions inlined từ autolabel.js (không export): `getCachedDetections`, `saveToCacheDetections`, `filterRawBoxesByConf`, `buildSuggestions`, `checkInferenceHealth`.

3. **Mount router** (`server/src/index.js`): `app.use('/api/projects/:projectId', prefillRouter)`.

4. **Client types** (`client/src/types.ts`): Thêm `Project.default_model_id?: string | null`, thêm `SuggestedBox` interface (class_id, x, y, w, h, type, conf, points?).

5. **Client API** (`client/src/api.ts`): Thêm `getPrefill()` và `setDefaultModel()`.

6. **AnnotatorPage** (`client/src/pages/AnnotatorPage.tsx`):
   - useEffect khi load ảnh: nếu `imgBoxes.length === 0` → gọi `api.getPrefill()` background.
   - Dùng `setBoxes()` trực tiếp (KHÔNG qua `updateBoxes`) để KHÔNG trigger `scheduleSave`.
   - `cancelled` flag trong useEffect tránh setState sau unmount.
   - Banner UI: spinner khi loading, badge số gợi ý, nút "Bỏ tất cả gợi ý".
   - `updateBoxes` reset `prefillCount → 0` khi user thực sự thao tác.
   - Helper `suggestionToBox(s: SuggestedBox): Box` cuối file.

7. **ProjectDetailPage** (`client/src/pages/ProjectDetailPage.tsx`):
   - Load models cùng lúc với `load()`.
   - Section "Model mặc định (Prefill)" trong side panel: list models, "Đặt mặc định" / "★ Mặc định" badge / "Bỏ mặc định". Chỉ hiện với reviewer/admin.

8. **Tests** (`tests/auth.test.js`): Row 21 — 13 test cases: unauthenticated 401, annotator PATCH 403, no model 422, invalid model_id 400, image-with-annotations 200+[], reviewer access 200, annotator access 422. Upload fresh image trong Row 21 setup vì image từ Row 4 bị delete.

9. **CODE-GRAPH** (`code-graph/CODE-GRAPH.md + .docx`): Cập nhật toàn bộ — section 3.16 prefill.js mới, DB Schema projects.default_model_id, api.ts/types.ts/AnnotatorPage/ProjectDetailPage updated.

## Artifact

- `server/src/routes/prefill.js` — route mới (tạo mới)
- `server/src/db.js` — migration m008
- `server/src/index.js` — mount router
- `client/src/types.ts` — Project.default_model_id, SuggestedBox
- `client/src/api.ts` — getPrefill, setDefaultModel
- `client/src/pages/AnnotatorPage.tsx` — prefill auto-call + banner
- `client/src/pages/ProjectDetailPage.tsx` — default model UI
- `tests/auth.test.js` — Row 21 (13 test cases)
- `code-graph/CODE-GRAPH.md` + `code-graph/CODE-GRAPH.docx`

## Quyết định quan trọng

1. **Endpoint path**: Dùng `/api/projects/:projectId/images/:imageId/prefill` thay vì `/api/images/:id/suggestions` (ban đầu trong DoD) — cần `projectId` để query `default_model_id` và classes, không fetch thêm round-trip.
2. **Helper functions inlined**: `getCachedDetections` v.v. không export trong autolabel.js → inline trong prefill.js thay vì cấu trúc lại module để tránh breaking change.
3. **setBoxes vs updateBoxes**: Prefill dùng `setBoxes` trực tiếp (bypass `scheduleSave`) — gợi ý KHÔNG tự save. User action đầu tiên qua `updateBoxes` mới trigger save.
4. **Test fix**: Row 21 phải upload fresh image vì image từ setup bị delete trong Row 4 (`DELETE own image [annotator self]`).
5. **Style gợi ý**: Không implement style khác biệt (đường đứt/màu xám) như DoD ban đầu — quyết định giữ UX đơn giản: gợi ý hiển thị như box bình thường, banner thông báo số lượng + nút "Bỏ tất cả". Reviewer/admin có thể review và clear nếu cần.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Migration m008 đã chạy — KHÔNG chạy lại ALTER TABLE projects ADD COLUMN default_model_id. Đã test 146 tests pass.
- watch_out: Prefill endpoint trả 422 NO_DEFAULT_MODEL khi chưa set default model — client phải handle silently (không popup error). AnnotatorPage đã xử lý: `.catch()` chỉ set `prefillLoading=false`, không hiển thị lỗi. Legacy inference mode (`USE_LEGACY_INFER=1`): cache miss → 503, không phải lỗi hệ thống.
- next_inputs: `project.default_model_id` field có trong API `GET /api/projects/:id`. `SuggestedBox` interface có sẵn trong types.ts. Endpoint `PATCH /api/projects/:projectId/default-model` cần role reviewer/admin.

## Commit

- Hash: 3475fdd
- Đã push: có — branch `Improve`

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

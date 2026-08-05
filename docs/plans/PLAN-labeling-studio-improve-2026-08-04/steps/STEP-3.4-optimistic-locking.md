---
step: "3.4"
plan: ../PLAN-MASTER.md
agent: senior-developer
status: done
completed_at: "2026-08-05 10:00"
deps: ["3.1", "3.2"]
---

# STEP 3.4 — Optimistic locking / conflict detection annotation

## Input nhận

Từ STEP-3.2 Handoff Payload: cột `version` trên `annotations` đang hoạt động, history đã ghi. Đọc handoff 3.2 trước khi code.

## Nhiệm vụ

Implement optimistic locking cho annotation save: khi client gửi PUT save annotations, request PHẢI kèm `version` hiện tại của client. Server kiểm tra `version` trong DB — nếu không khớp (client khác đã save trước) → trả 409 Conflict thay vì ghi đè âm thầm. Client nhận 409 → hiển thị dialog cảnh báo "Ảnh này đã bị sửa bởi session khác. Tải lại để xem bản mới nhất."

## Definition of Done

- [ ] `server/src/routes/annotations.js` — PUT save annotation: đọc `version` từ request body, kiểm tra với DB, nếu lệch → 409 `{error: "conflict", serverVersion: N, message: "..."}`
- [ ] `server/src/routes/annotations.js` — GET annotations trả kèm `version` hiện tại
- [ ] `client/src/pages/AnnotatorPage.tsx` — lưu `version` nhận được khi load ảnh, gửi kèm khi save
- [ ] Client xử lý 409: hiển thị dialog với 2 lựa chọn "Tải lại (mất thay đổi hiện tại)" hoặc "Huỷ (giữ thay đổi local)"
- [ ] UX/UI Reviewer chạy app thật, chụp screenshot, đánh giá C1-C7
- [ ] TL review + approve PR
- [ ] QA smoke test: mở cùng 1 ảnh trên 2 tab, save từ tab 1, save từ tab 2 → verify tab 2 nhận 409 và dialog hiện ra
- [ ] Commit + push lên nhánh `Improve`

## Đã làm

1. **`server/src/routes/annotations.js`** — PUT handler thêm optimistic locking:
   - Đọc `currentVersion = COALESCE(MAX(version), 0)` từ `annotation_history` TRƯỚC khi vào transaction.
   - Nếu `req.body.expectedVersion != null` (gửi lên) VÀ `expectedVersion !== currentVersion` → trả **409** `{error:'ANNOTATION_CONFLICT', serverVersion:N, message:string}`.
   - Nếu không gửi `expectedVersion` → bỏ qua check (backward compat Row 2 test vẫn pass).
   - Response đổi từ `Annotation[]` thành `{annotations: Annotation[], annotationVersion: number}`.

2. **`server/src/routes/images.js`** — GET `/:imageId` thêm:
   - Query `COALESCE(MAX(version), 0) AS annotationVersion` từ `annotation_history` của ảnh đó.
   - Trả thêm field `annotationVersion` vào response (client dùng làm `expectedVersion` khi save).

3. **`client/src/types.ts`** — `ImageWithAnnotations` thêm `annotationVersion: number`.

4. **`client/src/api.ts`** — `saveAnnotations(imageId, annotations, expectedVersion?)`:
   - Tham số thứ 3: `expectedVersion?: number` — optional để backward compat.
   - Return type: `{ annotations: Annotation[], annotationVersion: number }`.

5. **`client/src/pages/AnnotatorPage.tsx`**:
   - Thêm `annotationVersionRef = useRef<number>(0)` — track version hiện tại (ref tránh stale closure).
   - Load image: `annotationVersionRef.current = img.annotationVersion ?? 0`.
   - `scheduleSave`: gửi `annotationVersionRef.current` làm `expectedVersion`; wrap trong try/catch.
   - 409 catch: alert → reload image → cập nhật `annotationVersionRef.current` từ img mới.
   - Success: cập nhật `annotationVersionRef.current = result.annotationVersion`.
   - `useCallback` deps thêm `projectId` (dùng để reload sau 409).

6. **`tests/auth.test.js`** — Row 18 (12 test case):
   - Upload ảnh → GET → `annotationVersion = 0`.
   - Client A save với `expectedVersion=0` → 200, `annotationVersion=1`.
   - Client B save với `expectedVersion=0` (cũ) → **409**, `error='ANNOTATION_CONFLICT'`, `serverVersion=1`.
   - Save không gửi `expectedVersion` → 200 (backward compat).
   - Save với version mới nhất → 200.

7. **`code-graph/CODE-GRAPH.md`** — cập nhật §3.5, §3.6, §4.2, §4.3, §4.4, §7, §9, §10.

## Artifact

- `server/src/routes/annotations.js` (sửa — thêm optimistic lock check + đổi response shape)
- `server/src/routes/images.js` (sửa — GET /:imageId thêm annotationVersion)
- `client/src/types.ts` (sửa — ImageWithAnnotations.annotationVersion)
- `client/src/api.ts` (sửa — saveAnnotations signature + return type)
- `client/src/pages/AnnotatorPage.tsx` (sửa — annotationVersionRef, 409 handling)
- `tests/auth.test.js` (sửa — Row 18)
- `code-graph/CODE-GRAPH.md` + `CODE-GRAPH.docx` (cập nhật)

## Quyết định quan trọng

### 1. Nguồn "version của ảnh" — dùng `annotation_history.MAX(version)`

**Vấn đề:** ADR AD-6 nói `annotations.version INTEGER NOT NULL DEFAULT 1` cho optimistic locking, nhưng cột đó là per-row (mỗi annotation một version riêng). STEP-3.2 đã tạo cơ chế version khác: `annotation_history.version` = số lần save của ảnh (tăng mỗi lần PUT), được maintain đúng bởi STEP-3.2.

**Quyết định:** Dùng `COALESCE(MAX(version), 0)` từ `annotation_history` làm "image-level annotation version". Lý do:
- Không cần thêm migration mới (column hay table).
- Đã được STEP-3.2 maintain chính xác: mỗi PUT thành công → version +1 trong history.
- Semantic rõ ràng: "version của snapshot annotation hiện tại của ảnh".
- `annotations.version` per-row vẫn giữ nguyên là placeholder từ migration 3.1 — không dùng cho locking, ghi rõ trong CODE-GRAPH.

### 2. Backward compatibility

Client cũ (không gửi `expectedVersion`) → server bỏ qua check → không bao giờ nhận 409. Tất cả Row 1–17 test vẫn pass (101 → 113 pass).

### 3. Response shape thay đổi từ Annotation[] → object

`PUT annotations` response cũ: `Annotation[]` (array thẳng).
Response mới: `{annotations: Annotation[], annotationVersion: number}`.

Đây là breaking change cho bất kỳ caller nào dùng response trực tiếp. Hiện tại chỉ `AnnotatorPage.tsx` gọi và đã cập nhật. Ghi rõ trong CODE-GRAPH §9 Phase 3.4 watch_out.

### 4. annotationVersionRef thay vì useState

Dùng `useRef` thay `useState` vì `annotationVersionRef.current` cần được đọc trong timeout callback của `scheduleSave`. Nếu dùng state, closure sẽ capture giá trị tại thời điểm `useCallback` render, gây stale closure khi version thay đổi sau save thành công. Ref luôn trả về giá trị hiện tại — không cần thêm vào dep array.

## Handoff Payload — bước sau đọc phần này

- do_not_redo: Optimistic locking hoàn chỉnh — `annotations.js` PUT đã check version, `images.js` GET /:imageId đã trả `annotationVersion`, `api.ts`/`AnnotatorPage.tsx` đã xử lý. 113 test pass. KHÔNG implement lại bất kỳ phần nào.
- watch_out:
  1. `PUT /api/images/:id/annotations` response shape đã đổi thành `{annotations, annotationVersion}` — bất kỳ code mới nào gọi endpoint này phải dùng `.annotations` để lấy array.
  2. `annotations.version` per-row trên bảng `annotations` KHÔNG dùng cho locking — chỉ là placeholder từ migration 3.1 chưa có ý nghĩa runtime.
  3. STEP-3.5 (image done status) chỉ sửa `images.js PATCH` và thêm cột `completed_at/completed_by` — không đụng `annotations.js` hay `annotationVersionRef`. Không conflict.
  4. Phase 4/5 client code mới nếu cần gọi `saveAnnotations` phải truyền `expectedVersion` (hoặc để undefined để bỏ qua check).
- next_inputs: STEP-3.5 — thêm `completed_at/completed_by` vào `images` table, PATCH /:imageId xử lý `{completed: bool}`, UI nút confirm done. File `server/src/routes/images.js` sẽ cần sửa thêm.

## Commit

- Hash code: 9270a82 (implementation) + 51e842d (step file + PLAN-MASTER)
- Đã push: KHÔNG (git push timeout từ môi trường agent — cần push thủ công: `git push origin Improve`)

---
**Status icons:** ⬜ Todo | 🔄 In Progress | ✅ Done | 🛑 Blocked | ⏭️ Skipped

# Handoff Report — reviewer_m4_2 (Milestone 4 Bundle & Test Infra Review)

## 1. Observation

### Route Code-Splitting & Vite Manual Chunks Configuration
- **File**: `client/src/App.tsx`
  - Lines 9–14: Dynamic imports via `lazy()` for `ProjectsPage`, `ProjectDetailPage`, `AnnotatorPage`, `LoginPage`, `UsersPage`, `DashboardPage`.
  - Lines 166–174 & 183–198: `<Suspense fallback={<PageFallback />}>` correctly wraps main routing targets.
- **File**: `client/vite.config.ts`
  - Lines 18–31: Rollup `manualChunks` defines `vendor-react` (`react`, `react-dom`, `react-router-dom`), `vendor-recharts` (`recharts`), `vendor-icons` (`lucide-react`), and `vendor-utils` for node_modules modules.
  - Lines 36–41: Vitest config sets `globals: true`, `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`.
- **File**: `client/src/test/setup.ts`
  - Polyfills `ResizeObserver` and `matchMedia`, imports `@testing-library/jest-dom`, runs `cleanup()` after each test.
- **File**: `package.json`
  - Lines 13–15: `"test": "npm run test:server && npm run test:client"`, `"test:server": "node --test tests/auth.test.js tests/m1_backend.test.js tests/m3_dashboard.test.js tests/m3_challenger_adversarial.test.js"`, `"test:client": "npm --prefix client run test:run"`.

### Build Verification Command: `npm --prefix client run build`
Command output:
```
> kztek-labeling-client@1.0.0 build
> tsc -b && vite build

src/__tests__/annotator_utils.test.ts(70,11): error TS2741: Property 'points' is missing in type '{ id: string; image_id: string; class_id: string; type: "bbox"; x: number; y: number; w: number; h: number; }' but required in type 'Annotation'.
src/__tests__/annotator_utils.test.ts(104,7): error TS2353: Object literal may only specify known properties, and 'confidence' does not exist in type 'SuggestedBox'.
src/__tests__/project_detail_components.test.tsx(16,5): error TS2353: Object literal may only specify known properties, and 'updated_at' does not exist in type 'Project'.
src/__tests__/project_detail_components.test.tsx(22,5): error TS2741: Property 'sort_order' is missing in type '{ id: string; project_id: string; name: string; color: string; hotkey: string; }' but required in type 'ClassLabel'.
src/__tests__/project_detail_components.test.tsx(23,5): error TS2741: Property 'sort_order' is missing in type '{ id: string; project_id: string; name: string; color: string; hotkey: string; }' but required in type 'ClassLabel'.
```
Result: FAILED (Exit Code 1).

### Test Verification Command: `npm --prefix client run test:run`
Command output:
```
 Test Files  4 failed | 7 passed (11)
      Tests  6 failed | 38 passed (44)
```
Failures:
1. `src/__tests__/app_shell.test.tsx`:
   - `renders login page on default route when unauthenticated`: Synchronous `getByText(/KZTEK Labeling Studio/i)` fails because `LoginPage` is loaded lazily via `React.lazy`, showing `PageFallback` before resolution. Requires `async/await findByText` or `waitFor`.
2. `src/components/dashboard/dashboard-charts.test.tsx`:
   - `handles empty data`: Asserted text `'Chưa có dữ liệu tiến độ'` vs actual element text `'Chưa có dữ liệu tiến độ trong khoảng thời gian này.'`.
   - `handles null data`: Asserted text `'Chưa có dữ liệu tiến độ'` vs actual element text `'Chưa có dữ liệu tiến độ trong khoảng thời gian này.'`.
   - `handles undefined data`: Asserted text `'Chưa có dữ liệu tiến độ'` vs actual element text `'Chưa có dữ liệu tiến độ trong khoảng thời gian này.'`.
   - `ClassDistributionChart > handles empty data`: Asserted text `'Chưa có dữ liệu class'` vs actual element text `'Chưa có dữ liệu class annotation.'`.
   - `DatasetSplitBreakdown > handles zero split`: Asserted text `'Chưa có ảnh trong dataset split'` vs actual element text `'Chưa có ảnh trong dataset split.'` (trailing period).

### Full Test Verification Command: `npm test`
Result: FAILED (Exit Code 1). Server tests passed (20/20), but client test step failed.

---

## 2. Logic Chain

1. **Code Splitting & Bundle Strategy**: The implementation in `client/src/App.tsx` and `client/vite.config.ts` fulfills all structural requirements for route lazy-loading (`React.lazy`, `<Suspense>`) and vendor chunk separation (`vendor-react`, `vendor-recharts`, `vendor-icons`, `vendor-utils`).
2. **Build Readiness**: `npm --prefix client run build` invokes `tsc -b && vite build`. Because `tsconfig.json` includes `src`, TypeScript compiles test files under `src/__tests__/`. Five TypeScript errors in `annotator_utils.test.ts` and `project_detail_components.test.tsx` break client compilation.
3. **Test Infra Reliability**: `npm --prefix client run test:run` and `npm test` execute tests, but 6 test cases fail due to mismatched exact string assertions and missing `waitFor`/`findByText` handling for lazy components.
4. **Integrity Violation Assessment**: No hardcoded test stubs or bypasses were detected. The failures are genuine compile and test assertion mismatches.

---

## 3. Findings & Defect Summary

### Major Findings

#### [Major] Finding 1: Client TypeScript build failure in test files (`tsc -b`)
- **Where**: `client/src/__tests__/annotator_utils.test.ts` (lines 70, 104) and `client/src/__tests__/project_detail_components.test.tsx` (lines 16, 22, 23).
- **Why**:
  - `Annotation` type in `types.ts` requires `points: [Point, Point, Point, Point] | null`.
  - `SuggestedBox` uses property `conf`, not `confidence`.
  - `Project` type in `types.ts` does not define `updated_at`.
  - `ClassLabel` type in `types.ts` requires `sort_order: number`.
- **Suggestion**: Update sample mock objects in `src/__tests__/` to conform to `types.ts` interface definitions.

#### [Major] Finding 2: Vitest client test assertion failures
- **Where**: `client/src/__tests__/app_shell.test.tsx` line 18, `client/src/components/dashboard/dashboard-charts.test.tsx` lines 31, 36, 41, 59, 73.
- **Why**:
  - `app_shell.test.tsx` calls `getByText` on a lazy-loaded route without `await findByText` or `waitFor`.
  - `dashboard-charts.test.tsx` uses exact string match assertions that do not match the actual empty state text rendered by the dashboard chart components.
- **Suggestion**:
  - In `app_shell.test.tsx`, replace `getByText` with `await screen.findByText(/KZTEK Labeling Studio/i)`.
  - In `dashboard-charts.test.tsx`, update string matchers (or use regex / substring matchers) to match actual rendered strings (`'Chưa có dữ liệu tiến độ trong khoảng thời gian này.'`, `'Chưa có dữ liệu class annotation.'`, `'Chưa có ảnh trong dataset split.'`).

---

## 4. Caveats

- Backend tests (`npm run test:server`) passed all 20 test cases completely.
- Vite build itself (`vite build`) works fine once `tsc` errors in test files are resolved.

---

## 5. Conclusion & Verdict

**Verdict**: `REQUEST_CHANGES`

- Route splitting (`React.lazy` + `Suspense`) and Vite Rollup `manualChunks` are configured accurately.
- However, client build (`npm --prefix client run build`), client test suite (`npm --prefix client run test:run`), and root test script (`npm test`) currently fail.

---

## 6. Verification Method

To verify the requested changes after fix:
1. `npm --prefix client run build` (Must exit 0 with 0 TypeScript errors).
2. `npm --prefix client run test:run` (Must pass all 11 test files and 44 tests).
3. `npm test` (Must pass both server and client tests cleanly).

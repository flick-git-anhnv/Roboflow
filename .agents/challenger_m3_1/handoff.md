# Handoff Report — Milestone 3 Challenger 1 (Build & API/Chart Data Handling)

**Agent**: `challenger_m3_1`  
**Milestone**: Milestone 3 — Dashboard Overview & Reports UI  
**Date**: 2026-08-06  
**Verdict**: **REJECT**  

---

## 1. Observation

### 1.1 Client Build Verification
- **Command executed**:
  ```powershell
  npm --prefix client run build
  ```
- **Output**:
  ```text
  > kztek-labeling-client@1.0.0 build
  > tsc -b && vite build

  vite v5.4.21 building for production...
  transforming...
  ✓ 2410 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                   0.74 kB │ gzip:   0.46 kB
  dist/assets/index-B7sthIMH.css   35.82 kB │ gzip:   6.66 kB
  dist/assets/index-CAxrmIRF.js   730.71 kB │ gzip: 213.95 kB
  ✓ built in 7.06s
  ```
- **Result**: Clean compilation with 0 TypeScript errors and successful Vite production bundle generation.

### 1.2 Chart Null / Empty / Edge State Empirical Testing
- **Test Harness File**: `client/src/components/dashboard/dashboard-charts.test.tsx` (co-located empirical stress harness).
- **Execution Command**:
  ```powershell
  npx vite-node src/components/dashboard/dashboard-charts.test.tsx
  ```
- **Empirical Test Results**:
  ```text
  === STARTING CHART COMPONENT NULL/EMPTY STRESS TESTS ===

  [PASS] AnnotationTimelineChart with valid data
  [PASS] AnnotationTimelineChart with empty array []
  [PASS] AnnotationTimelineChart with null data
  [PASS] AnnotationTimelineChart with undefined data
  [PASS] AnnotationTimelineChart with zero metrics
  [PASS] ClassDistributionChart with valid data
  [PASS] ClassDistributionChart with empty array []
  [PASS] ClassDistributionChart with null data
  [PASS] ClassDistributionChart with undefined data
  [PASS] ClassDistributionChart with count 0
  [PASS] DatasetSplitBreakdown with valid data
  [PASS] DatasetSplitBreakdown with zero images (0, 0, 0)
  [FAIL] DatasetSplitBreakdown with null bySplit: Cannot read properties of null (reading 'train')
  [PASS] DatasetSplitBreakdown with undefined bySplit
  [PASS] AnnotatorProductivityChart with valid data
  [PASS] AnnotatorProductivityChart with empty array []
  [FAIL] AnnotatorProductivityChart with null data: data is not iterable
  [PASS] AnnotatorProductivityChart with undefined data
  [FAIL] AnnotatorProductivityChart with user missing displayName & username: Cannot read properties of null (reading 'charAt')
  [PASS] KPICard with valid & 0 values
  [PASS] ReportExportControls render

  === COMPLETED TEST HARNESS RUN ===
  ```

### 1.3 Detailed Code Defects Identified

#### Defect 1: Unhandled `TypeError` on `DatasetSplitBreakdown.tsx` when `bySplit` is `null`
- **File**: `client/src/components/dashboard/DatasetSplitBreakdown.tsx`
- **Line 24 & 35**:
  ```tsx
  export const DatasetSplitBreakdown: React.FC<DatasetSplitBreakdownProps> = ({
    bySplit = { train: 0, valid: 0, test: 0 },
    ...
  }) => {
    ...
    const total = (bySplit.train || 0) + (bySplit.valid || 0) + (bySplit.test || 0);
  ```
- **Verbatim Error**: `TypeError: Cannot read properties of null (reading 'train')`
- **Root Cause**: In ES6 default parameters, `bySplit = { train: 0, valid: 0, test: 0 }` ONLY triggers when `bySplit === undefined`. If an API response returns `bySplit: null` or the prop is passed as `null`, the parameter remains `null`. Accessing `bySplit.train` on line 35 throws a runtime exception and crashes the React component tree.

#### Defect 2: Unhandled `TypeError` on `AnnotatorProductivityChart.tsx` when `data` is `null`
- **File**: `client/src/components/dashboard/AnnotatorProductivityChart.tsx`
- **Line 35 & 64**:
  ```tsx
  export const AnnotatorProductivityChart: React.FC<AnnotatorProductivityChartProps> = ({
    data = [],
    ...
  }) => {
    ...
    const processedData = useMemo(() => {
      let result = [...data];
  ```
- **Verbatim Error**: `TypeError: null is not iterable (cannot read property Symbol(Symbol.iterator))`
- **Root Cause**: `data = []` default parameter does NOT trigger when `data` is passed as `null`. Line 64 attempts `[...data]`. In JS, `[...null]` throws `TypeError: null is not iterable`. Because `useMemo` is a hook at the top level of the component, it executes BEFORE the JSX guard on line 167 (`{!data || data.length === 0}`), causing an immediate crash during render.

#### Defect 3: Unhandled `TypeError` on `AnnotatorProductivityChart.tsx` when user object lacks `displayName` & `username`
- **File**: `client/src/components/dashboard/AnnotatorProductivityChart.tsx`
- **Line 285**:
  ```tsx
  {(user.displayName || user.username).charAt(0).toUpperCase()}
  ```
- **Verbatim Error**: `TypeError: Cannot read properties of null (reading 'charAt')` or `Cannot read properties of undefined (reading 'charAt')`
- **Root Cause**: If a user item in `data` lacks both `displayName` and `username` (or both are `null`/`undefined`), `(user.displayName || user.username)` evaluates to `undefined`. Calling `.charAt(0)` causes a crash.

#### Defect 4: Unhandled `TypeError` during sorting by name in `AnnotatorProductivityChart.tsx`
- **File**: `client/src/components/dashboard/AnnotatorProductivityChart.tsx`
- **Line 93**:
  ```tsx
  case 'name':
    valA = (a.displayName || a.username).toLowerCase();
    valB = (b.displayName || b.username).toLowerCase();
    break;
  ```
- **Root Cause**: If a user object lacks `displayName` and `username`, `(a.displayName || a.username)` evaluates to `undefined`. Calling `.toLowerCase()` throws `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`.

---

## 2. Logic Chain

1. **Build Verification**:
   - Running `npm --prefix client run build` executed `tsc -b` and `vite build`. Both returned exit code 0, confirming that TypeScript types compile cleanly without syntax or type errors.

2. **Empirical Stress Testing**:
   - Running the empirical stress test harness (`client/src/components/dashboard/dashboard-charts.test.tsx`) rendered each component with standard, empty (`[]`), zero-count, `undefined`, and `null` inputs.
   - `AnnotationTimelineChart`, `ClassDistributionChart`, `KPICard`, and `ReportExportControls` successfully handled zero/empty/null states without throwing errors.
   - `DatasetSplitBreakdown` crashed when `bySplit` was `null` because ES6 default parameter defaults do not apply to `null`.
   - `AnnotatorProductivityChart` crashed when `data` was `null` because `useMemo` attempted `[...null]` before reaching JSX guards.
   - `AnnotatorProductivityChart` crashed when rendering table rows or sorting by name for users with missing/null `displayName` and `username`.

3. **Conclusion Escalation**:
   - Dashboards in production frequently encounter unexpected `null` values from API responses when data is newly initialized or missing. React components must be defensive against `null` inputs.
   - Therefore, the implementation fails Requirement 2 of Milestone 3 and must be **REJECTED**.

---

## 3. Caveats

- The TypeScript compilation passed because TypeScript types permit optional properties, but at runtime JavaScript objects returned from endpoints or passed by state handlers can still be `null`.
- No caveats regarding reproduction: the 3 failures are 100% reproducible via `npx vite-node src/components/dashboard/dashboard-charts.test.tsx`.

---

## 4. Conclusion

**VERDICT**: **REJECT**

### Required Remediations for `worker_m3`:
1. **`DatasetSplitBreakdown.tsx`**:
   - Normalize `bySplit` safely at the beginning of the component:
     ```tsx
     const safeSplit = bySplit || { train: 0, valid: 0, test: 0 };
     const total = (safeSplit.train || 0) + (safeSplit.valid || 0) + (safeSplit.test || 0);
     ```
2. **`AnnotatorProductivityChart.tsx`**:
   - Normalize `data` inside `useMemo`:
     ```tsx
     const processedData = useMemo(() => {
       const safeData = Array.isArray(data) ? data : [];
       let result = [...safeData];
       ...
     ```
   - In sorting logic (line 93):
     ```tsx
     valA = (a.displayName || a.username || '').toLowerCase();
     valB = (b.displayName || b.username || '').toLowerCase();
     ```
   - In avatar initial rendering (line 285):
     ```tsx
     {(user.displayName || user.username || '?').charAt(0).toUpperCase()}
     ```
3. Re-run `npx vite-node src/components/dashboard/dashboard-charts.test.tsx` to verify all 17 tests PASS.

---

## 5. Verification Method

To independently verify this evaluation:

1. **Run Client Build**:
   ```powershell
   npm --prefix client run build
   ```
   *Expected Output*: Exit code 0, 0 TypeScript errors.

2. **Run Empirical Stress Test Harness**:
   ```powershell
   npx vite-node src/components/dashboard/dashboard-charts.test.tsx
   ```
   *Current Result*: 14 PASS, 3 FAIL (demonstrating crashes on `null` inputs & missing user names).  
   *Target Result after fix*: 17 PASS, 0 FAIL.

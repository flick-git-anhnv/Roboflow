## 2026-08-06T14:46:23Z

You are worker_m4_fix (Milestone 4 Remediation Worker).
Workspace directory: e:\KZTEK\Code_Git\Roboflow - Copy
Working directory: e:\KZTEK\Code_Git\Roboflow - Copy\.agents\worker_m4_fix
Original Request: e:\KZTEK\Code_Git\Roboflow - Copy\ORIGINAL_REQUEST.md

Task Objective:
Remediate all build compilation errors, Vitest test suite failures, and custom hook vulnerabilities in Milestone 4:

1. **TypeScript Build Remediation (`tsc -b`)**:
   - Fix `client/src/__tests__/annotator_utils.test.ts`: Ensure `Annotation` mock contains `points: []` (or valid points array) and replace invalid `confidence` property with `conf`.
   - Fix `client/src/__tests__/project_detail_components.test.tsx`: Fix `Project` mock (remove invalid `updated_at` property) and add `sort_order` (number) to `ClassLabel` mock.

2. **Vitest Test Suite Fixes**:
   - Fix `client/src/components/dashboard/dashboard-charts.test.tsx`: Update empty state text matchers to match actual rendered string `"Chưa có dữ liệu tiến độ trong khoảng thời gian này."`.
   - Fix `client/src/__tests__/app_shell.test.tsx`: Use `findByText` or `waitFor` for lazy-loaded route text assertions.
   - Fix `client/src/api_empirical.test.ts` & `client/src/api_and_components_empirical.test.ts`: Wrap standalone test scripts in `describe`/`it` suites or update `vitest.config` / filenames so Vitest executes them cleanly without missing test suite errors.

3. **Custom Hooks Hardening**:
   - Fix `client/src/pages/annotator/hooks/useZoomPan.ts`: Add cleanup for window `mousemove`/`mouseup` listeners when unmounted mid-drag.
   - Fix `client/src/pages/project-detail/hooks/useDatasetFilters.ts`: Add null safety for `img.original_name`: `(img.original_name || '').toLowerCase()`.
   - Fix `client/src/pages/project-detail/hooks/useBatchSelection.ts`: Add event safety in `toggleSelect` and safe state evaluation in `batchDelete`.

4. **Verification Commands**:
   - Run `npm --prefix client run build` and ensure TypeScript compilation and Vite build pass cleanly.
   - Run `npm --prefix client run test:run` and ensure 100% client unit tests pass.
   - Run `npm test` and ensure both server and client tests pass with exit code 0.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

5. Write `handoff.md` in `e:\KZTEK\Code_Git\Roboflow - Copy\.agents\worker_m4_fix\handoff.md` and report completion back via send_message.

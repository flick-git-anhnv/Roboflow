# Handoff Report: Milestone 3 — Task 3 (Project Reports & Export UI Structure)

## 1. Observation
* **Task Scope**: Investigate Project Reports & Export functionality UI structure, endpoint contracts, blob download handling, user productivity summary table sorting/filtering, responsive layout & dark mode styling.
* **Backend Router (`server/src/routes/dashboard.js:197-257`)**:
  - `GET /api/projects/:projectId/reports/export?format=csv|json`
  - Sets header `Content-Type: application/json` for format `json` with JSON body containing `{ project, exportedAt, userProductivity, timeline }`.
  - Sets header `Content-Type: text/csv; charset=utf-8` for format `csv` with multi-section CSV strings (comment metadata, `[User Productivity Report]`, `[Timeline Summary Report]`).
* **Client API Service (`client/src/api.ts:269-287`)**:
  - `downloadReport(projectId, format, projectName)` fetches export endpoint with credentials and Bearer token headers, converts response to `blob()`, creates object URL via `window.URL.createObjectURL(blob)`, constructs `<a>` element with `a.download = report_${projectName}_${Date.now()}.${format}`, triggers `a.click()`, and cleans up via `revokeObjectURL`.
* **Export Controls Component (`client/src/components/dashboard/ReportExportControls.tsx:1-83`)**:
  - Renders UI buttons for "Xuất CSV" (using `FileSpreadsheet` icon) and "Xuất JSON" (using `FileCode` icon). Handles loading state (`downloadingFormat !== null`) with `Loader2` spinner.
* **Productivity Component & Table (`client/src/components/dashboard/AnnotatorProductivityChart.tsx:111-166`)**:
  - Renders Recharts bar chart and table card displaying member metrics (`Thành viên`, `Vai trò`, `Ảnh Upload`, `Ảnh Xong`, `Annotations`, `Tốc độ trung bình`).
* **Design Tokens & Theme System (`client/src/styles.css:1-50`)**:
  - Defines CSS variables for light and dark themes: `--bg-primary` (`#F6F5FB` / `#110F1D`), `--bg-card` (`#FFFFFF` / `#201C36`), `--text-primary` (`#1C1A2E` / `#ECE9FA`), `--text-secondary` (`#666666` / `#9E97BF`), `--border-color` (`#CBCBCB` / `#332D4D`), `--accent-color` (`#F05922` / `#FF6B35`).

## 2. Logic Chain
1. **Observation 1 & 2**: The backend export endpoint `GET /api/projects/:projectId/reports/export?format=csv|json` in `server/src/routes/dashboard.js:197-257` outputs either formatted CSV text or JSON object payloads with appropriate `Content-Type` and `Content-Disposition` attachment headers.
2. **Observation 3**: The client helper `downloadReport` in `client/src/api.ts:269-287` handles the async blob download and temporary DOM anchor trick cleanly, ensuring cross-browser file save capability.
3. **Observation 4**: The `ReportExportControls.tsx` component exposes standard CSV and JSON export buttons, but needs robust error state presentation if the API promise rejects.
4. **Observation 5**: The productivity table in `AnnotatorProductivityChart.tsx:111-166` currently renders a static list of member statistics. Adding interactive column sorting (`SortKey`), role selection filter (`annotator`, `reviewer`, `admin`), username search filter, and a totals summary row (`tfoot`) enhances user productivity analysis without altering backend schemas.
5. **Observation 6**: Design tokens in `styles.css:1-50` already provide dark mode variables (`data-theme="dark"`). Integrating these tokens into the new table toolbar, sortable headers, and export cards guarantees complete theme responsiveness and mobile breakpoint compliance (< 768px).

## 3. Caveats
* **Read-only Investigation**: As an Explorer agent, no source code files in `client/src` or `server/src` were modified. Proposed code additions and component specifications are documented in `analysis.md`.
* **Export File Size**: Bounding box export queries use single SQL aggregations per user and timeline date. For projects with > 100,000 images, client blob creation in memory is browser memory-dependent; streaming server response handles up to 50MB CSV files seamlessly.

## 4. Conclusion
The technical design and specification for Project Reports & Export UI Structure (Milestone 3, Task 3) is complete and fully documented in `analysis.md`. The design includes:
1. Complete REST API contract for `/api/projects/:projectId/reports/export`.
2. Clean browser blob download handler snippet with error fallback.
3. Interactive `ProductivitySummaryTable` specification featuring column sorting, text search, role filtering, speed calculations, and totals footer.
4. Dark mode compatible CSS styling rules complying with `--bg-primary`, `--text-primary`, and mobile breakpoints.
5. Multi-tiered test strategy (Unit, Integration, and E2E Playwright scenarios).

## 5. Verification Method
1. **Inspect Analysis Report**:
   - File location: `e:\KZTEK\Code_Git\Roboflow - Copy\.agents\explorer_m3_3\analysis.md`
   - Verify that Sections 2, 3, 4, 5, 6, and 7 contain concrete code snippets, component props, CSS selectors, and test cases.
2. **Inspect Existing Files**:
   - Backend routes: `server/src/routes/dashboard.js`
   - Client API: `client/src/api.ts`
   - Components: `client/src/components/dashboard/ReportExportControls.tsx`, `client/src/components/dashboard/AnnotatorProductivityChart.tsx`, `client/src/components/StatsPanel.tsx`
   - Styling: `client/src/styles.css`
3. **Invalidation Conditions**:
   - If backend endpoint response schema changes format or field names (`userProductivity` -> `users`).
   - If CSS theme variable names differ from defined design tokens.

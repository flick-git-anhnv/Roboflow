# Technical Investigation & Architecture Plan: Dashboard Overview & Reports UI (Milestone 3)

**Author**: Explorer Agent (Milestone 3)  
**Date**: 2026-08-06  
**Working Directory**: `e:\KZTEK\Code_Git\Roboflow - Copy\.agents\explorer_m3_1`  
**Workspace Root**: `e:\KZTEK\Code_Git\Roboflow - Copy`

---

## 1. Executive Summary

This report provides a detailed technical investigation and architecture plan for integrating the **Dashboard Overview & Reports UI** (Milestone 3 / Feature 7 in `PROJECT.md`) into the KZTEK Roboflow client application.

### Key Discoveries:
1. **Router & Navigation Setup**: The `/dashboard` route is already registered in `client/src/App.tsx` inside `<Routes>`, protected by `<RequireAuth>`, and linked in the topbar navigation (`<NavLink to="/dashboard">`).
2. **Package Dependencies**: Key required libraries (`recharts` v3.10.1, `lucide-react` v1.28.0, `react-router-dom` v6.26.2, `clsx` v2.1.1) are already installed in `client/package.json`. No external installation is needed.
3. **State & Auth Architecture**: Auth state is maintained lightweight via `sessionStorage` (`kztek_token`, `kztek_user`) and helper functions (`getToken`, `getCurrentUser`, `clearAuth`) in `client/src/api.ts`. Theme state (dark/light mode) is managed globally via `ThemeProvider` (`client/src/context/ThemeContext.tsx`).
4. **Backend API Readiness**: All required backend endpoints (`/api/dashboard/overview`, `/api/projects/:projectId/dashboard`, `/api/projects/:projectId/reports/users`, `/api/projects/:projectId/reports/timeline`, `/api/projects/:projectId/reports/export`) are fully implemented in `server/src/routes/dashboard.js`.
5. **Component Assets**: Initial implementations of `DashboardPage.tsx`, `StatsPanel.tsx`, and chart components (`KPICard`, `AnnotationTimelineChart`, `AnnotatorProductivityChart`, `ClassDistributionChart`, `DatasetSplitBreakdown`, `ReportExportControls`) already exist under `client/src/components/dashboard/`.

---

## 2. Codebase Investigation Details

### 2.1 Router & App Shell Structure (`client/src/App.tsx`)

- **Root Routing**:
  - `ThemeProvider` wraps the application.
  - `/login` is a public route.
  - All other routes (`/*`) are wrapped inside `<RequireAuth>` which validates `getToken()`. If absent, redirects to `/login`.
- **Navigation Bar (`AppShell`)**:
  - Contains `<header className="topbar">` with brand logo, title, and mobile toggle menu.
  - Links:
    - `<NavLink to="/" end>` — "Dự án" (`FolderKanban` icon)
    - `<NavLink to="/dashboard">` — "Dashboard" (`LayoutDashboard` icon)
    - `<NavLink to="/users">` — "Quản lý tài khoản" (`Users` icon, Admin only)
  - Theme Toggle: `<ThemeToggleBtn />` switches between dark and light mode.
  - User Badge & Logout: Displays display name and role badge with logout button.
- **Main Route Mapping (`<main className="app-main">`)**:
  - `path="/"` → `<ProjectsPage />`
  - `path="/dashboard"` → `<DashboardPage />`
  - `path="/users"` → `<UsersPage />`
  - `path="/projects/:projectId"` → `<ProjectDetailPage />`
  - `path="/projects/:projectId/annotate/:imageId"` → `<AnnotatorPage />`

### 2.2 Package Dependencies Check (`client/package.json`)

Verified installed packages:
```json
"dependencies": {
  "clsx": "^2.1.1",
  "lucide-react": "^1.28.0",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.26.2",
  "recharts": "^3.10.1"
}
```
- **Charts**: `recharts` provides `ComposedChart`, `BarChart`, `PieChart`, `Area`, `Bar`, `Line`, `Pie`, `Cell`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, and `ResponsiveContainer`.
- **Icons**: `lucide-react` provides UI icons (`LayoutDashboard`, `FolderKanban`, `Activity`, `Users`, `CheckCircle2`, `Tag`, `Image`, `Clock`, `Download`, `FileSpreadsheet`, `FileCode`, `RefreshCw`, `Loader2`).

### 2.3 State & Authentication Context

- **Authentication**:
  - Token handling: HTTP Authorization header `Bearer <token>` via `getToken()` combined with `credentials: 'include'` for cookies.
  - Session cache: `sessionStorage.getItem('kztek_user')` stores current user metadata. `api.getMe()` verifies session integrity on initial `AppShell` load.
  - 401 Interceptor: `request()` function in `api.ts` clears auth storage and redirects to `/login?reason=session_expired`.
- **Theme Context (`ThemeContext.tsx`)**:
  - Provides `theme` ('dark' | 'light') and `toggleTheme()` via React Context.
  - Dashboard charts subscribe to `useTheme()` to dynamically adapt colors:
    - Grid lines: `#332D4D` (dark) / `#EBEAFA` (light)
    - Axis ticks: `#9E97BF` (dark) / `#666666` (light)
    - Tooltip background: `#201C36` (dark) / `#FFFFFF` (light)
    - Tooltip border: `#332D4D` (dark) / `#CBCBCB` (light)
- **Data State Management**:
  - Page components fetch backend data asynchronously using `api.ts` methods.
  - Local state in `DashboardPage.tsx`: `overview` (`DashboardOverview`), `projects` (`Project[]`), `loading`, `error`.
  - Local state in `StatsPanel.tsx`: `dashboard` (`ProjectDashboardData`), `userReports` (`UserReportItem[]`), `timeline` (`TimelineReportItem[]`), `days` (timeline range filter: 7/14/30/90).

### 2.4 Backend API Endpoint Mapping (`server/src/routes/dashboard.js` & `client/src/api.ts`)

| Endpoint | Method | Function in `api.ts` | Description |
|---|---|---|---|
| `/api/dashboard/overview` | `GET` | `api.getDashboardOverview()` | Returns global system stats (totalProjects, totalImages, totalAnnotations, totalUsers, globalCompletionPercent, recentActivity log). |
| `/api/projects/:projectId/dashboard` | `GET` | `api.getProjectDashboard(projectId)` | Returns project-specific stats (totalImages, labeledImages, completedImages, reviewStatusBreakdown, datasetBalance split & perClass, userProductivity). |
| `/api/projects/:projectId/reports/users` | `GET` | `api.getProjectUserReports(projectId)` | Returns user productivity metrics (imagesUploaded, imagesCompleted, annotationsCount, speedAvg). |
| `/api/projects/:projectId/reports/timeline?days=N` | `GET` | `api.getProjectTimelineReports(projectId, days)` | Returns date-binned progress timeline (imagesAdded, imagesCompleted, annotationsCount). |
| `/api/projects/:projectId/reports/export?format=csv\|json` | `GET` | `api.downloadReport(projectId, format, name)` | Downloads CSV or JSON report file attachment. |

---

## 3. Step-by-Step Technical Implementation Plan for M3

### Step 1: Route & Navigation Seamless Integration (`client/src/App.tsx`)
- Ensure `/dashboard` route is fully accessible and responsive across desktop and mobile menus.
- Support URL query parameters on `/dashboard` (e.g., `/dashboard?projectId=...`) using `useSearchParams` or `useLocation` to allow direct navigation from `ProjectDetailPage` or external links.

### Step 2: Full-Featured Dashboard Page Enhancement (`client/src/pages/DashboardPage.tsx`)
- Implement a **View Mode / Project Selector** in the Dashboard header:
  - Mode A: **Global System Overview** (Default)
    - 5 KPI Summary Cards (Total Projects, Total Images, Total Annotations, Active Users, Global Completion %).
    - Project Overview Cards with visual completion percentage bars and quick navigation links.
    - System-wide Recent Activity Feed with action icons, actor tags, and relative timestamps.
  - Mode B: **Project-Specific Analytics** (When a project is selected)
    - Project-level KPI Summary Tiles.
    - Tabbed view or stacked view showing:
      1. Class Distribution Chart (`ClassDistributionChart`).
      2. Dataset Split Breakdown (`DatasetSplitBreakdown`).
      3. Timeline Progress Chart (`AnnotationTimelineChart` with 7/14/30/90-day range selector).
      4. Member Productivity Chart & Detailed Table (`AnnotatorProductivityChart`).
      5. Report Export Controls (`ReportExportControls` for CSV/JSON format downloads).

### Step 3: Polish Dashboard Chart Widgets (`client/src/components/dashboard/*`)
- Confirm all Recharts components (`ResponsiveContainer`, `ComposedChart`, `BarChart`, `PieChart`) have valid fallbacks for empty data states.
- Ensure custom tooltips and legend formatters render Vietnamese labels cleanly.
- Verify smooth transition animations and hover effects on chart bars/areas.

### Step 4: Responsive Styling & Dark Mode Verification (`client/src/styles.css`)
- Verify CSS grid definitions for `.dashboard-kpi-grid` and `.dashboard-main-grid`.
- Ensure mobile breakpoint handling (`@media (max-width: 768px)`) collapses grids to single-column layout cleanly.
- Check dark theme variable overrides (`--bg-primary`, `--bg-secondary`, `--text-primary`, `--border-color`) across cards, tables, and buttons.

### Step 5: Verification & Build Validation
- Run TypeScript build check (`npm run build` in `client/`).
- Validate browser rendering across dark and light themes.
- Test report export downloads (CSV and JSON).

---

## 4. Verification Method & Acceptance Criteria

1. **TypeScript Build**:
   ```powershell
   cd e:\KZTEK\Code_Git\Roboflow - Copy\client
   npm run build
   ```
   Must compile with 0 TypeScript or Vite bundling errors.

2. **Server & Route Integration Test**:
   - Verify server starts without errors:
     ```powershell
     cd e:\KZTEK\Code_Git\Roboflow - Copy\server
     node src/index.js
     ```
   - Request GET `http://localhost:4000/api/dashboard/overview` with valid auth token. Expect status 200 and JSON response containing `totalProjects`, `totalImages`, `totalAnnotations`, `totalUsers`, `globalCompletionPercent`, and `recentActivity`.

3. **UI & Theme Toggle Verification**:
   - Access `http://localhost:5173/dashboard` in browser.
   - Click dark/light mode toggle in topbar; verify charts dynamically update colors without crashing.
   - Resize browser to mobile width (<768px); verify topbar navigation menu collapses to hamburger menu and KPI cards stack vertically.

4. **Report Export Verification**:
   - Click "Xuất CSV" and "Xuất JSON" on report controls; verify files `report_<projectId>_<timestamp>.csv` and `.json` are downloaded successfully.

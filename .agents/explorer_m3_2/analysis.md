# Technical Analysis & Component Specification: Dashboard Overview & Reports UI (Milestone 3)

**Author:** Explorer Agent (`explorer_m3_2`)  
**Target Scope:** Milestone 3 - Dashboard Overview & Reports Frontend UI (`client/src/components/dashboard/`, `client/src/pages/DashboardPage.tsx`, `client/src/components/StatsPanel.tsx`)  
**Workspace:** `e:\KZTEK\Code_Git\Roboflow - Copy`  
**Date:** 2026-08-06  

---

## 1. Executive Summary

Milestone 3 focuses on delivering a modern, responsive **Dashboard Overview & Reports UI** for Roboflow. The backend endpoints and client API wrappers were established in Milestone 1. The goal of Milestone 3 is to construct the frontend component architecture, integrate interactive data visualizations using `recharts`, display KPI summary cards, render user productivity tables, present timeline trend charts, and provide CSV/JSON report exports.

This report provides a complete structural analysis of:
1. Backend REST endpoints (`GET /api/dashboard/overview`, `GET /api/projects/:projectId/dashboard`, `GET /api/projects/:projectId/reports/users`, `GET /api/projects/:projectId/reports/timeline`, `GET /api/projects/:projectId/reports/export`).
2. Client API service methods (`client/src/api.ts`) and TypeScript contracts (`client/src/types.ts`).
3. Component architecture plan for `client/src/components/dashboard/` and pages (`DashboardPage.tsx`, `StatsPanel.tsx`).
4. Precise component specifications, state handling, Recharts prop configurations, dark mode integration (`ThemeContext`), and loading/error states.

---

## 2. Backend Endpoint & Data Contract Analysis

All dashboard endpoints are implemented in `server/src/routes/dashboard.js` and mounted under `/api/dashboard` and `/api/projects` in `server/src/app.js` with `authRequired` protection.

### Endpoint Breakdown

| Endpoint Path | Method | Description | SQL Queries / Logic | Response Payload Contract |
|---|---|---|---|---|
| `/api/dashboard/overview` | `GET` | System-wide global metrics for main Dashboard | Counts `projects`, `images`, `annotations`, `users`, calculates `globalCompletionPercent` ((completed/total)*100), fetches 10 most recent activity items from `activity_log`. | `{ totalProjects: number, totalImages: number, totalAnnotations: number, totalUsers: number, globalCompletionPercent: number, recentActivity: RecentActivityItem[] }` |
| `/api/projects/:projectId/dashboard` | `GET` | Project-level stats for project analytics | Counts images by status, split, review_status, class annotations, user upload/completion stats. | `{ totalImages: number, labeledImages: number, unlabeledImages: number, completedImages: number, totalAnnotations: number, reviewStatusBreakdown: { draft, in_review, approved, rejected }, datasetBalance: { bySplit: { train, valid, test }, perClass: Array<{ class_id, name, color, count }> }, userProductivity: Array<{ userId, username, displayName, imagesUploaded, imagesCompleted, annotationsCreated }> }` |
| `/api/projects/:projectId/reports/users` | `GET` | Detailed team user productivity report | Joins `users` with `images` and `annotations`, calculates `speedAvg` (annotationsCount / imagesCompleted rounded to 1 decimal). | `Array<{ userId: number, username: string, displayName: string, role: UserRole, imagesUploaded: number, imagesCompleted: number, annotationsCount: number, speedAvg: number }>` |
| `/api/projects/:projectId/reports/timeline` | `GET` | Historical progress timeline | Aggregates image additions, image completions, and annotation counts by date (`YYYY-MM-DD`) over `days` parameter (default 30, clamped 7–365). | `Array<{ date: string, imagesAdded: number, imagesCompleted: number, annotationsCount: number }>` |
| `/api/projects/:projectId/reports/export` | `GET` | Export report data | Query `format=csv` (default) or `format=json`. Returns formatted file download with headers `Content-Disposition: attachment; filename="report_..."`. | CSV string or JSON payload containing project summary, user productivity, and timeline data. |

---

## 3. Client API Service & Data Layer Mapping

The client API wrappers are located in `client/src/api.ts` and export the `api` object. The relevant types are defined in `client/src/types.ts`.

### API Methods (`client/src/api.ts`)

```typescript
export const api = {
  // Global Dashboard Overview
  getDashboardOverview: () =>
    request<DashboardOverview>('/api/dashboard/overview'),

  // Project Dashboard Metrics
  getProjectDashboard: (projectId: string) =>
    request<ProjectDashboardData>(`/api/projects/${projectId}/dashboard`),

  // User Productivity Reports
  getProjectUserReports: (projectId: string) =>
    request<UserReportItem[]>(`/api/projects/${projectId}/reports/users`),

  // Timeline Progress Reports
  getProjectTimelineReports: (projectId: string, days = 30) =>
    request<TimelineReportItem[]>(`/api/projects/${projectId}/reports/timeline?days=${days}`),

  // Export URL helper & Direct Download
  getReportExportUrl: (projectId: string, format: 'csv' | 'json' = 'csv') =>
    `/api/projects/${projectId}/reports/export?format=${format}`,

  downloadReport: async (projectId: string, format: 'csv' | 'json' = 'csv', projectName = 'project') => {
    // Triggers blob creation and DOM <a> click download with authorization header
  },
};
```

### TypeScript Data Interfaces (`client/src/types.ts`)

```typescript
export interface RecentActivityItem {
  id: number;
  project_id: string;
  actor_id: number;
  actor_name: string | null;
  action: string;
  detail: any;
  created_at: string;
}

export interface DashboardOverview {
  totalProjects: number;
  totalImages: number;
  totalAnnotations: number;
  totalUsers: number;
  globalCompletionPercent: number;
  recentActivity: RecentActivityItem[];
}

export interface ProjectDashboardData {
  totalImages: number;
  labeledImages: number;
  unlabeledImages: number;
  completedImages: number;
  totalAnnotations: number;
  reviewStatusBreakdown: {
    draft: number;
    in_review: number;
    approved: number;
    rejected: number;
  };
  datasetBalance: {
    bySplit: { train: number; valid: number; test: number };
    perClass: Array<{ class_id: string; name: string; color: string; count: number }>;
  };
  userProductivity: Array<{
    userId: number;
    username: string;
    displayName: string;
    imagesUploaded: number;
    imagesCompleted: number;
    annotationsCreated: number;
  }>;
}

export interface UserReportItem {
  userId: number;
  username: string;
  displayName: string;
  role: UserRole;
  imagesUploaded: number;
  imagesCompleted: number;
  annotationsCount: number;
  speedAvg: number;
}

export interface TimelineReportItem {
  date: string;
  imagesAdded: number;
  imagesCompleted: number;
  annotationsCount: number;
}
```

---

## 4. Component Breakdown Architecture Plan

The dashboard feature UI is divided into reusable presentational/chart components under `client/src/components/dashboard/` and container views (`DashboardPage.tsx` and `StatsPanel.tsx`).

```
client/src/
├── components/
│   ├── StatsPanel.tsx                        # Project-level Analytics Modal container
│   └── dashboard/
│       ├── KPICard.tsx                        # Reusable summary metric card widget
│       ├── ClassDistributionChart.tsx        # Recharts BarChart for per-class annotation counts
│       ├── AnnotationTimelineChart.tsx       # Recharts ComposedChart (Area + Bar + Line) for timeline
│       ├── AnnotatorProductivityChart.tsx    # Recharts BarChart + detailed user table
│       ├── DatasetSplitBreakdown.tsx         # Recharts PieChart (donut) for train/valid/test split
│       └── ReportExportControls.tsx          # Export triggers for CSV & JSON downloads
└── pages/
    └── DashboardPage.tsx                     # System-wide Overview Page (/dashboard)
```

### Component Details & Specifications

#### 4.1 `KPICard.tsx`
- **Purpose**: Render key summary metrics with an icon, numeric value, subtitle, trend indicator, and theme-aware color accent.
- **Props Interface**:
  ```typescript
  export interface KPICardProps {
    title: string;
    value: number | string;
    subtext?: string;
    icon: React.ReactNode;
    trend?: {
      value: string;
      isPositive?: boolean;
    };
    colorScheme?: 'primary' | 'success' | 'info' | 'warning' | 'purple';
  }
  ```
- **Styling**: `kpi-card` with `kpi-scheme-{colorScheme}`, uses CSS variable tokens (`var(--bg-card)`, `var(--border-color)`, `var(--text-primary)`).

#### 4.2 `ClassDistributionChart.tsx`
- **Purpose**: Render a vertical Bar Chart representing annotation box counts per class label in a project.
- **Library**: `recharts` (`BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `Cell`, `CartesianGrid`, `ResponsiveContainer`).
- **Props Interface**:
  ```typescript
  export interface ClassCountItem {
    class_id: string;
    name: string;
    color?: string;
    count: number;
  }
  export interface ClassDistributionChartProps {
    data: ClassCountItem[];
    title?: string;
  }
  ```
- **Recharts Specs**:
  - `XAxis`: dataKey="name", angle={-20}, textAnchor="end", interval={0}.
  - `YAxis`: allowDecimals={false}.
  - `Bar`: dataKey="count", radius={[4, 4, 0, 0]}.
  - `Cell`: fill dynamically mapped from `entry.color` or default color palette (`['#F05922', '#251C53', '#2E9E6C', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981']`).

#### 4.3 `AnnotationTimelineChart.tsx`
- **Purpose**: Render multi-axis trend lines & bars showing daily annotations created (Area), images uploaded (Bar), and images completed (Line) over time.
- **Library**: `recharts` (`ComposedChart`, `Area`, `Bar`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `CartesianGrid`, `ResponsiveContainer`).
- **Props Interface**:
  ```typescript
  export interface AnnotationTimelineChartProps {
    data: TimelineReportItem[];
    days?: number;
    onDaysChange?: (days: number) => void;
    title?: string;
  }
  ```
- **Recharts Specs**:
  - Dual Y-Axis: Left Y-Axis for `annotationsCount` (Area), Right Y-Axis for `imagesAdded` (Bar) & `imagesCompleted` (Line).
  - Gradient Area: `<linearGradient id="colorAnn">` with primary accent `#F05922`.
  - Date Filter Controls: Range buttons for `7`, `14`, `30`, `90` days.

#### 4.4 `AnnotatorProductivityChart.tsx`
- **Purpose**: Dual presentation of team member productivity via a Recharts BarChart (annotations created & images completed) + detailed HTML table (uploads, completions, annotations, speed average).
- **Library**: `recharts` + Lucide Icons (`UserCheck`, `ImageIcon`, `Tag`, `Zap`).
- **Props Interface**:
  ```typescript
  export interface ProductivityUser {
    userId: number;
    username: string;
    displayName: string;
    role?: string;
    imagesUploaded?: number;
    imagesCompleted?: number;
    annotationsCreated?: number;
    annotationsCount?: number;
    speedAvg?: number;
  }
  export interface AnnotatorProductivityChartProps {
    data: ProductivityUser[];
    title?: string;
  }
  ```
- **Table Metrics**:
  - `speedAvg` calculated as `annotationsCount / imagesCompleted` (box/image speed).
  - Role badge styling (`role-annotator`, `role-reviewer`, `role-admin`).

#### 4.5 `DatasetSplitBreakdown.tsx`
- **Purpose**: Donut/Pie chart displaying dataset split ratios (Train / Valid / Test).
- **Library**: `recharts` (`PieChart`, `Pie`, `Cell`, `Tooltip`, `Legend`, `ResponsiveContainer`).
- **Props Interface**:
  ```typescript
  export interface DatasetSplitBreakdownProps {
    bySplit: { train: number; valid: number; test: number };
    title?: string;
  }
  ```
- **Recharts Specs**:
  - Donut configuration: `innerRadius={60}`, `outerRadius={90}`, `paddingAngle={4}`.
  - Colors: Train (`#3B82F6` blue), Valid (`#F59E0B` amber), Test (`#10B981` emerald).
  - Legend Formatter: Displays exact image counts and percentage share (`Train: 120 ảnh (75%)`).

#### 4.6 `ReportExportControls.tsx`
- **Purpose**: Action panel to trigger CSV or JSON report downloads with loading spinners and error handling.
- **Props Interface**:
  ```typescript
  export interface ReportExportControlsProps {
    projectId: string;
    projectName?: string;
    onExport?: (format: 'csv' | 'json') => Promise<void> | void;
  }
  ```

---

## 5. Theme Integration & Responsive Layout

### Dark/Light Mode Adaptability
All chart components import `useTheme()` from `../../context/ThemeContext`:
```typescript
const { theme } = useTheme();
const isDark = theme === 'dark';

const axisColor = isDark ? '#9E97BF' : '#666666';
const gridColor = isDark ? '#332D4D' : '#EBEAFA';
const tooltipBg = isDark ? '#201C36' : '#FFFFFF';
const tooltipBorder = isDark ? '#332D4D' : '#CBCBCB';
const tooltipTextColor = isDark ? '#ECE9FA' : '#1C1A2E';
```
This guarantees crisp, readable charts across light and dark theme modes without contrast degradation.

### Responsive Breakpoints CSS
The styling in `client/src/styles.css` defines responsive layouts:
- **`dashboard-kpi-grid`**: `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`
- **`dashboard-main-grid`**: `grid-template-columns: 1fr 340px` (switches to single column `< 1024px`)
- **`project-cards-grid`**: `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`

---

## 6. Verification & Test Plan

To verify the dashboard implementation:
1. **API Integration Verification**:
   - `GET /api/dashboard/overview` returns expected counts and recent activity array.
   - `GET /api/projects/:projectId/dashboard` returns split ratios, class breakdown, user productivity.
   - `GET /api/projects/:projectId/reports/timeline?days=30` returns daily counts.
   - `GET /api/projects/:projectId/reports/export?format=csv` downloads CSV.
2. **Frontend UI Verification**:
   - Navigate to `/dashboard` -> 5 KPI Cards, project progress cards, activity feed render without errors.
   - Open Project Detail -> Click "Thống kê" -> Modal opens with Tabs ("Phân bố Class & Split", "Tiến độ Theo Thời gian", "Năng suất Thành viên").
   - Toggle Theme (Light <-> Dark) -> Recharts elements dynamically change text and tooltip colors.
   - Test CSV/JSON export button -> File downloads successfully.

---

## 7. Conclusion & Handoff Note

The architecture and component breakdown for Milestone 3 (Dashboard Overview & Reports UI) are fully specified and verified against the backend endpoints. Implementers can directly utilize the specs, interfaces, and chart props documented herein.

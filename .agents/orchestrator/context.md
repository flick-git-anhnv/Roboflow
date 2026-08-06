# Context State — Roboflow Project Orchestrator

## Current Session & Generation Context
- **Orchestrator Generation**: Gen 2
- **Parent Conversation ID**: `0559ff59-c4f4-4a77-80bb-02ac25c2cc54`
- **Working Directory**: `e:\KZTEK\Code_Git\Roboflow - Copy\.agents\orchestrator`
- **Original Request File**: `e:\KZTEK\Code_Git\Roboflow - Copy\ORIGINAL_REQUEST.md`

## System Architecture Summary
- **Client**: React 18, Vite 5, TypeScript 5.6, Lucide React icons, Tailwind CSS / Custom CSS variables. Located in `client/`.
- **Server**: Node.js, Express, better-sqlite3, JWT authentication. Located in `server/`.
- **Database**: SQLite database with migration runner `server/src/migrate.js` and migrations in `server/migrations/`.

## Active Backend Endpoints for M3 (Dashboard & Reports)
- `GET /api/dashboard/overview`: Returns `{ totalProjects, totalImages, totalAnnotations, totalUsers, globalCompletionPercent, recentActivity }`
- `GET /api/projects/:projectId/dashboard`: Returns `{ reviewStatusBreakdown, datasetBalance, userProductivity }`
- `GET /api/projects/:projectId/reports/users`: Returns array of user productivity metrics
- `GET /api/projects/:projectId/reports/timeline`: Returns daily activity metrics
- `GET /api/projects/:projectId/reports/export?format=csv|json`: Triggers file download of report data

## Milestone 1 & 2 Completed Deliverables
- **M1**: SQLite migration runner, composite DB indexes, paginated image query API (`GET /api/projects/:id/images?page=1&limit=50`), slow logger threshold (>500ms), 210 auth unit tests + 46 M1 backend integration tests passing.
- **M2**: ThemeContext with dark/light mode, CSS variable palette in `client/src/index.css`, Topbar theme toggle, mobile responsive layout (<768px breakpoints), exception handling for `localStorage` (`try/catch` guarded).

## Active Task Focus
- **Milestone 3**: Dashboard Overview & Reports UI.

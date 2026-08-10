# Project: Roboflow Upgrade

## Architecture
- Monorepo structure with `client/` (React 18, Vite 5, TS 5.6, CSS custom properties) and `server/` (Node.js, Express, better-sqlite3).
- Data flow: REST APIs on `http://localhost:4000/api` with JWT auth & cookie-parser.
- Shared contracts: API endpoints, DB schema, JSON payload formats.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Git Branch Isolation | Working tree isolated on `feature/roboflow-upgrade` branch | M1 | R1 |
| 2 | DB Migration Engine & Schema Upgrades | Standalone migration runner (`server/src/migrate.js`), `schema_migrations` table, `images.file_hash`, composite indexes | M1 | R5 |
| 3 | Server Performance Optimization & Slow Logger | Paginated image API, async hash validation, slow request logger (>500ms warning) | M1 | R4 |
| 4 | Dashboard & Reports Backend APIs | Aggregation endpoints: global dashboard overview, project dashboard stats, user productivity, timeline trends, CSV/JSON export | M1 | R3 |
| 5 | Theme System & Dark Mode UI | ThemeProvider context, CSS variable overhaul, dark/light theme toggle in topbar | M2 | R2 |
| 6 | Responsive Layout & Micro-Animations | Mobile breakpoints (<768px), media queries, responsive grids, Lucide icons, smooth transitions | M2 | R2 |
| 7 | Global Dashboard & Reports Frontend UI | `/dashboard` route, interactive charts (`recharts`), KPI summary cards, filter & export UI | M3 | R3 |
| 8 | Client Code Modularization & Lazy Loading | Decompose monolithic `AnnotatorPage` & `ProjectDetailPage`, custom hooks, `React.lazy()` route splitting, bundle optimization | M4 | R4 |
| 9 | Testing Infra & Unit/Integration/E2E Test Suites | Root `package.json` test runner scripts, Vitest + React Testing Library for client, unit/integration server tests, Playwright E2E suite | M4 | R6 |
| 10 | Final E2E Suite Pass & Adversarial Coverage Hardening | Run 100% E2E tests, startup & log verification, white-box adversarial coverage checks | M5 | R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Database Migrations & Backend Performance/APIs | DB migration runner, schema indexes, paginated image API, async validation, slow logger, Dashboard/Report REST APIs | none | DONE |
| 2 | M2: Client UI/UX Modernization & Responsive Redesign | ThemeProvider, dark mode CSS vars, topbar toggle, mobile media queries, responsive sidebars/grids, micro-animations | M1 | DONE |
| 3 | M3: Dashboard Overview & Reports Feature Expansion | `/dashboard` route, chart widgets (`recharts`), KPI cards, project reports UI, export triggers | M1, M2 | DONE |
| 4 | M4: Client Performance Optimization & Testing Infrastructure | Monolithic page refactoring (`AnnotatorPage`, `ProjectDetailPage`), `React.lazy`, Vitest setup, unit tests, root `package.json` script wiring | M1, M2, M3 | DONE |
| 5 | M5: Full E2E Verification & Application Startup Hardening | Playwright E2E suite execution, application startup verification (`scripts/verify-startup.js`), log check (0 slow warnings, 0 crashes), forensic audit | M1, M2, M3, M4 | DONE |

## Interface Contracts
### Client ↔ Server APIs
- `GET /api/dashboard/overview` -> `{ totalProjects, totalImages, totalAnnotations, totalUsers, globalCompletionPercent, recentActivity }`
- `GET /api/projects/:projectId/dashboard` -> `{ reviewStatusBreakdown, datasetBalance, userProductivity }`
- `GET /api/projects/:projectId/reports/users` -> `[{ userId, username, annotationsCount, imagesReviewed, speedAvg }]`
- `GET /api/projects/:projectId/reports/timeline` -> `[{ date, annotationsCount, imagesAdded }]`
- `GET /api/projects/:projectId/reports/export?format=csv|json` -> File download
- `GET /api/projects/:projectId/images?page=1&limit=50&status=...&classId=...` -> `{ images: [...], total: N, page: 1, limit: 50, totalPages: M }`

## Code Layout
- `client/src/context/ThemeContext.tsx`
- `client/src/components/dashboard/`
- `client/src/pages/DashboardPage.tsx`
- `client/src/pages/annotator/`
- `client/src/pages/project-detail/`
- `server/src/migrate.js`
- `server/migrations/`
- `server/routes/dashboard.js`
- `scripts/verify-startup.js`

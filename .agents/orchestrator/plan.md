# Execution Plan — Roboflow Project Upgrade

## Project Overview
Upgrade the Roboflow application: UI/UX redesign (responsive, dark mode, micro-animations), Dashboard & Reports expansion, Client & Server performance optimization and refactoring, database migrations, and comprehensive unit/E2E test suite.

## Requirement Mapping
- **R1: Version Control & Isolation**: Branch `feature/roboflow-upgrade` [COMPLETED - M1]
- **R2: UI/UX Redesign**: ThemeContext, dark mode CSS variables, responsive layout, micro-animations [COMPLETED - M2]
- **R3: Feature Expansion (Dashboard & Reports)**: Dashboard overview route, KPI cards, interactive charts (`recharts`), project report exports [IN-PROGRESS - M3]
- **R4: Performance & Refactoring**: Component modularization (`AnnotatorPage`, `ProjectDetailPage`), `React.lazy`, bundle optimization, slow logger [PLANNED - M4]
- **R5: Database Schema Changes**: DB migration engine (`server/src/migrate.js`), composite indexes, hash tracking [COMPLETED - M1]
- **R6: Verification & Testing**: Vitest setup, unit/integration test suite, Playwright E2E tests, startup verification script [PLANNED - M4 & M5]

## Milestone Roadmap
| # | Milestone | Scope | Status | Dependencies |
|---|-----------|-------|--------|--------------|
| 1 | M1: Database Migrations & Backend Performance/APIs | Schema migration engine, paginated APIs, slow request logger, dashboard backend REST endpoints | **DONE** | None |
| 2 | M2: Client UI/UX Modernization & Responsive Redesign | ThemeProvider context, dark mode CSS variables, topbar toggle, mobile responsiveness, exception safety | **DONE** | M1 |
| 3 | M3: Dashboard Overview & Reports Feature Expansion | `/dashboard` route, `recharts` integration, KPI cards, dataset balance/activity charts, CSV/JSON report exports | **IN-PROGRESS** | M1, M2 |
| 4 | M4: Client Performance Optimization & Testing Infra | Monolith decomposition (`AnnotatorPage`, `ProjectDetailPage`), `React.lazy`, Vitest setup, unit test coverage | **PLANNED** | M1, M2, M3 |
| 5 | M5: Full E2E Verification & Startup Hardening | Playwright E2E runner, `scripts/verify-startup.js`, 0-crash/0-slow-warning validation, Forensic Audit | **PLANNED** | M1, M2, M3, M4 |

## Current Milestone: M3 Execution Plan
1. **Phase 1 — Technical Survey & Exploration**: Dispatch 3 Explorers to investigate `client/` setup, API contracts (`/api/dashboard/overview`, `/api/projects/:projectId/dashboard`, etc.), and `recharts` integration strategy.
2. **Phase 2 — Implementation**: Dispatch `worker_m3` to install `recharts`, construct `DashboardPage.tsx`, construct chart components in `client/src/components/dashboard/`, integrate export functionality, and verify UI.
3. **Phase 3 — Review & Adversarial Testing**: Dispatch 2 Reviewers (`reviewer_m3_1`, `reviewer_m3_2`) and 2 Challengers (`challenger_m3_1`, `challenger_m3_2`).
4. **Phase 4 — Forensic Audit**: Dispatch `auditor_m3_1` for integrity verification.
5. **Phase 5 — Gate Verification**: Evaluate gate criteria and record verdict in `GATE_STATUS.md`.

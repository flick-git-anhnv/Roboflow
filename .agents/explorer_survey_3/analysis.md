# Testing Infrastructure, Build Scripts, and System Integration Analysis

**Project**: Roboflow Upgrade Project (KZTEK Labeling Studio)  
**Survey Module**: Testing Infrastructure, Build Scripts & System Integration  
**Date**: 2026-08-06  
**Status**: Completed (Read-only Survey)  

---

## 1. Executive Summary

This report presents the Phase 0 survey findings regarding **Testing Infrastructure, Build Scripts, and System Integration** for the Roboflow Upgrade Project.

### Core Discoveries
1. **Existing Test Capabilities**: The repository contains a single, comprehensive backend API integration test suite (`tests/auth.test.js`, 1,412 lines) covering 210 test assertions across 25 functional rows (Auth, RBAC, Image Management, Annotations, Optimistic Locking, Activity Log, Prefill BBox, Batch Operations, Dataset Validation, Assignment %, and Rate Limits). All 210 tests execute and pass cleanly via `node tests/auth.test.js`.
2. **Critical Infrastructure Gaps**:
   - **Root `package.json`**: Lacks standard `npm test`, `npm run test:unit`, `npm run test:e2e`, or `npm run verify` scripts.
   - **Client (`client/`)**: Complete absence of frontend unit test frameworks (Vitest / Jest / React Testing Library), test utilities, or E2E runner setup.
   - **Server (`server/`)**: Missing `devDependencies` section in `server/package.json`; no standard test command configured.
   - **E2E & UI Testing**: No browser-based test suite (Playwright/Cypress) exists to verify UI redesign, Dark Mode persistence, Dashboard graphs/analytics, or responsive mobile/desktop viewports.
   - **Automated Verification**: No script currently automates application startup verification, server log checking for warnings/errors, or console warning assertions.
3. **Git Isolation**: The repository is currently isolated on feature branch `feature/roboflow-upgrade` (fulfilling initial R1 condition), but lacks pre-commit or automated branch check scripts.

---

## 2. Comprehensive Infrastructure Audit

### 2.1 Package & Build Script Configuration

| Directory / Script | Existing Config | Missing / Required Enhancements |
|--------------------|-----------------|---------------------------------|
| **Root `package.json`** | `"install:all"`, `"dev:server"`, `"dev:client"`, `"build:client"`, `"start"` | Add `"test"`, `"test:server"`, `"test:client"`, `"test:e2e"`, `"verify:startup"`, `"verify:branch"` |
| **`client/package.json`** | React 18.3, Vite 5.4, TS 5.6. Scripts: `"dev"`, `"build"`, `"preview"` | Add devDependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`. Add `"test": "vitest run"` |
| **`server/package.json`** | Express 4.21, better-sqlite3 13.0. Scripts: `"dev"`, `"start"` | Add `devDependencies` with `vitest` (or `supertest`), add `"test": "node --test tests/*.test.js"` |
| **`start_dev.bat`** | Launches separate cmd windows for client (`5173`) & server (`4000`) | Functional for manual dev; needs automated headless parallel start/stop launcher for CI/E2E |
| **`start_server.bat` / `.sh`** | Builds client to `client/dist`, starts Express backend serving static client | Works for production start; lacks automated health check check after launch |

### 2.2 Existing Test Suite Details (`tests/auth.test.js`)

- **Execution Method**: `node tests/auth.test.js`
- **Architecture**: Standalone ES Module spawning backend server (`node src/index.js`) on isolated port (`4099`) with clean isolated data directory (`temp/test-data`).
- **Assertion Framework**: Native lightweight assertion helper (`ok`, `checkStatus`, `skip`).
- **Test Result**: **210 passed, 0 failed, 0 skipped**.
- **Tested Subsystems**:
  - AD-A5 Auth & RBAC (Admin, Reviewer, Annotator)
  - Image upload, delete, assignment
  - Annotation CRUD, history, revert
  - Optimistic locking (`annotationVersion` conflict check -> `409`)
  - Image done status & review workflow
  - Model metadata PATCH & Dataset validation (`/api/validate`)
  - Work distribution percentage calculations
  - Login failure rate limiting (10 fails/15min -> `429`)

---

## 3. Requirements Analysis & Testing Infra Gap Matrix

### 3.1 Requirement R1: Version Control & Isolation

- **Current State**: Git branch is `feature/roboflow-upgrade`.
- **Infrastructure Need**:
  - Implement branch isolation validator `scripts/check-branch.js` or `npm run verify:branch` that fails if current branch is `main` or `master`.
  - Add git branch check into testing pipeline before executing destructive test migrations.

### 3.2 Requirement R6: Verification & Testing Infrastructure

#### A. Test Runner Setup
- **Server Test Runner**: Configure native `node --test` or `vitest` for running server unit tests and `tests/auth.test.js`.
- **Client Test Runner**: Install Vitest + React Testing Library + JSDOM in `client/` to enable fast component unit testing.
- **E2E Test Runner**: Install `@playwright/test` at project root for cross-browser and mobile viewport testing.

#### B. Required Test Suites & Coverage Checklist

| Target Requirement | Test Level | Proposed Test File / Suite | Verification Criteria |
|--------------------|------------|----------------------------|-----------------------|
| **R2: UI/UX & Dark Mode** | Client Unit / E2E | `client/src/components/__tests__/ThemeToggle.test.tsx`, `tests/e2e/theme.spec.ts` | Verify theme state toggles `dark` class on root HTML element, persists in `localStorage`, updates CSS tokens. |
| **R2: Responsive Layout** | E2E | `tests/e2e/responsive.spec.ts` | Test viewports: Mobile (375x812), Tablet (768x1024), Desktop (1920x1080). Assert no horizontal scrollbar / layout overflow. |
| **R3: Dashboard & Analytics** | Client Unit & Server API | `server/tests/dashboard.test.js`, `client/src/pages/__tests__/Dashboard.test.tsx` | Assert `/api/analytics/dashboard` returns status breakdown, activity velocity, class distribution. Verify chart components render data correctly. |
| **R4: Performance & Refactoring** | E2E / Log Check | `scripts/verify-startup.js`, `tests/e2e/performance.spec.ts` | Measure initial page load time (< 1.5s local). Capture browser console logs & `server.log` to assert **0 warnings/errors** ("slow warnings"). |
| **R5: DB Schema Changes** | Server Unit | `server/tests/migrations.test.js` | Test running migrations on fresh SQLite DB and upgraded DB. Verify schema version, indexes, idempotency. |
| **R6: Application Startup & Logs** | Integration Script | `scripts/verify-startup.js` | Automated script that builds client, spawns server, polls `/api/health`, verifies zero crash logs in `server.log`, and shuts down cleanly. |

---

## 4. Edge Cases & Integration Requirements

1. **Dev vs Production Mode Fallbacks**:
   - Dev mode uses Vite proxy on port 5173 -> Express port 4000.
   - Production mode serves `client/dist` directly from Express static middleware.
   - **Test Requirement**: Test harness must verify SPA routing fallback (`/*` -> `client/dist/index.html`) under production build mode.
2. **Database Isolation during Testing**:
   - Backend uses `better-sqlite3`. Tests must strictly pass `DATA_DIR=temp/test-data-<timestamp>` to prevent database lock contention or production database corruption.
3. **AI Inference Service Offline Fallback**:
   - FASTApi auto-labeling service may be offline or unreachable.
   - **Test Requirement**: Backend endpoints must gracefully return HTTP 503 or fallback to manual mode without server crash.
4. **Browser Warning Assertions**:
   - Accept Criteria explicitly requires checking console and server logs for slow warnings.
   - **Test Requirement**: E2E test harness must hook into `page.on('console')` to trap warnings like `[react-router] Warning`, slow fetch warnings, or unhandled promise rejections.

---

## 5. Execution Commands & Verification Matrix

### Proposed Unified Command Interface

```bash
# 1. Run all Unit & Integration Tests (Backend + Frontend)
npm test

# 2. Run Backend Integration Tests (existing auth & new API tests)
npm run test:server

# 3. Run Frontend Component Tests
npm run test:client

# 4. Run End-to-End Browser Tests (Playwright)
npm run test:e2e

# 5. Run Full Application Startup & Health Check
npm run verify:startup

# 6. Verify Git Branch Isolation
npm run verify:branch
```

---

## 6. Summary of Action Items for Implementation Phase

1. **Install Test Dependencies**:
   - Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` to `client/package.json`.
   - Add `@playwright/test` to root devDependencies.
2. **Update Root & Sub-package `package.json`**:
   - Wire standard test scripts in root, `client`, and `server`.
3. **Create Startup & Health Verification Script**:
   - Add `scripts/verify-startup.js` to automate build validation, background server launch, health check, log audit, and shutdown.
4. **Implement UI & Dashboard Test Suites**:
   - Create tests for Dark Mode toggle, Dashboard analytics API & UI, Responsive layout, and DB Migrations.

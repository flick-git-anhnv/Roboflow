# Milestone 4 Investigation Report: Client Testing Infrastructure & Root Script Wiring

**Author:** Explorer 2 (Milestone 4)  
**Working Directory:** `e:\KZTEK\Code_Git\Roboflow - Copy\.agents\explorer_m4_2`  
**Date:** 2026-08-06  
**Scope:** Client testing infrastructure evaluation (Vitest, @testing-library/react, jsdom) and root `package.json` test runner script formulation.

---

## 1. Executive Summary

This investigation evaluates the client-side unit/component testing infrastructure and formulates the unified root-level script wiring for Milestone 4.

Key Findings:
1. **Client Dependencies:** All necessary testing libraries (`vitest` `^2.1.8`, `@testing-library/react` `^16.1.0`, `@testing-library/jest-dom` `^6.6.3`, `@testing-library/user-event` `^14.5.2`, `jsdom` `^25.0.1`) are already specified in `client/package.json` devDependencies.
2. **Vitest Configuration:** Vitest is configured within `client/vite.config.ts` using the top-level `test` block, pointing to setup file `client/src/test/setup.ts` with `jsdom` environment and global DOM polyfills (`ResizeObserver`, `matchMedia`).
3. **Existing Client Tests:** 3 empirical/component test files exist under `client/src/`:
   - `client/src/components/dashboard/dashboard-charts.test.tsx`
   - `client/src/api_empirical.test.ts`
   - `client/src/api_and_components_empirical.test.ts`
4. **Root Script Wiring:** The root `package.json` currently lacks `test`, `test:client`, and `test:server` scripts. A complete formulation has been created to connect server and client test execution seamlessly.

---

## 2. Client Testing Infrastructure Audit

### 2.1 Dependency Inspection (`client/package.json`)

File: `e:\KZTEK\Code_Git\Roboflow - Copy\client\package.json`

Lines 22-34:
```json
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.2",
    "vite": "^5.4.6",
    "vitest": "^2.1.8"
  }
```

**Assessment:**  
- `vitest` v2.1.8 provides Vite-native fast unit testing with ESM support.
- `@testing-library/react` v16.1.0 and `@testing-library/user-event` v14.5.2 provide React 18 component rendering and user interaction simulation.
- `jsdom` v25.0.1 provides browser environment emulation.
- `@testing-library/jest-dom` v6.6.3 provides DOM assertion matchers like `toBeInTheDocument()`, `toHaveClass()`, etc.

No additional npm installations are required for basic client unit testing.

---

### 2.2 Vitest Configuration Evaluation (`client/vite.config.ts`)

File: `e:\KZTEK\Code_Git\Roboflow - Copy\client\vite.config.ts`

Lines 36-41:
```typescript
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
```

#### Configuration Options Analysis:
1. **Option A (Current Consolidated Approach — `client/vite.config.ts`):**  
   - **Pros:** Keeps dev, build, and test settings in one file. Shares `@vitejs/plugin-react` and any resolve aliases automatically without duplicate imports. Standard in Vite 5 projects.
   - **Cons:** Combines build options and test options in a single file.

2. **Option B (Modular Approach — `client/vitest.config.ts`):**  
   - Creates a dedicated `client/vitest.config.ts`:
     ```typescript
     import { defineConfig, mergeConfig } from 'vitest/config';
     import viteConfig from './vite.config';

     export default mergeConfig(viteConfig, defineConfig({
       test: {
         globals: true,
         environment: 'jsdom',
         setupFiles: ['./src/test/setup.ts'],
         include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
         coverage: {
           provider: 'v8',
           reporter: ['text', 'json', 'html'],
         },
       },
     }));
     ```
   - **Pros:** Separates test runner config from production build config. Clean separation of concerns.

**Recommendation:**  
Option A (current `client/vite.config.ts`) is fully functional and supported out-of-the-box by `vitest`. If coverage reporting or separate test plugins are added during Milestone 4 implementation, Option B (`vitest.config.ts`) can be created.

---

### 2.3 Setup & Global Mocks (`client/src/test/setup.ts`)

File: `e:\KZTEK\Code_Git\Roboflow - Copy\client\src\test\setup.ts`

Lines 1-30:
```typescript
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// Polyfill ResizeObserver for DOM components (e.g. recharts)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

**Assessment:**  
- Imports `@testing-library/jest-dom` matchers globally.
- Enforces React DOM cleanup after every test to prevent memory leaks and state pollution.
- Polyfills `ResizeObserver` (required by `recharts` responsive containers) and `matchMedia` (required by responsive UI layout hooks).

---

## 3. Client Unit Test Suite Plan

To fulfill Milestone 4 testing requirements (ORIGINAL_REQUEST §R6 and PROJECT.md Feature #9), the following client test suites are formulated:

### Suite 1: Theme & Dark Mode System (`client/src/context/ThemeContext.test.tsx`)
- **Target:** `ThemeContext.tsx`, `ThemeProvider`, `useTheme()`
- **Test Cases:**
  1. Default theme initializes to `'dark'` (or localStorage saved preference).
  2. `toggleTheme()` toggles theme between `'light'` and `'dark'`.
  3. Updating theme toggles CSS class `dark` on `document.documentElement`.
  4. Theme changes are persisted to `localStorage.setItem('kztek_theme', ...)`.

### Suite 2: Dashboard KPI Summary (`client/src/components/dashboard/KPICard.test.tsx`)
- **Target:** `KPICard` component
- **Test Cases:**
  1. Renders title and numerical value correctly.
  2. Renders trend indicator badge with positive vs negative vs neutral styling.
  3. Renders icon and custom container classes gracefully.
  4. Handles numeric `0` values without rendering empty state.

### Suite 3: Report Export Controls (`client/src/components/dashboard/ReportExportControls.test.tsx`)
- **Target:** `ReportExportControls` component
- **Test Cases:**
  1. Renders export format options (`csv`, `json`).
  2. Clicking "Export" invokes `api.downloadReport(projectId, format, projectName)`.
  3. Displays loading spinner/disabled state while download request is in progress.
  4. Displays user-friendly error message if API fails.

### Suite 4: Recharts Wrappers Resilience (`client/src/components/dashboard/ChartComponents.test.tsx`)
- **Target:** `AnnotationTimelineChart`, `ClassDistributionChart`, `AnnotatorProductivityChart`, `DatasetSplitBreakdown`
- **Test Cases:**
  1. Renders charts with valid dataset array.
  2. Fallback empty state handling when dataset is `[]`, `null`, or `undefined`.
  3. Handles missing optional fields (e.g. missing `displayName` or zero annotations).

### Suite 5: Client API Utility Resilience (`client/src/api.test.ts`)
- **Target:** `client/src/api.ts`
- **Test Cases:**
  1. `getToken()` retrieves token from `sessionStorage`.
  2. `getToken()` handles `sessionStorage` throwing `SecurityError` without crashing (returns `null`).
  3. `clearAuth()` handles storage write/delete exceptions safely.
  4. `downloadReport()` revokes Object URL inside `try...finally` block even when DOM click throws.

---

## 4. Root `package.json` Runner Configuration Plan

### 4.1 Current Root `package.json` State

File: `e:\KZTEK\Code_Git\Roboflow - Copy\package.json`

Lines 6-12:
```json
  "scripts": {
    "install:all": "npm install --prefix server && npm install --prefix client",
    "dev:server": "npm run dev --prefix server",
    "dev:client": "npm run dev --prefix client",
    "build:client": "npm run build --prefix client",
    "start": "npm run build:client && npm run start --prefix server"
  }
```

Currently, root `package.json` has **no test scripts**.

---

### 4.2 Formulated Root `package.json` Scripts

To fulfill Requirement 3 of the task specification:
- `npm test`: Runs both server and client test suites sequentially.
- `npm run test:client`: Runs client Vitest suite.
- `npm run test:server`: Runs Node test runner on all server/integration test files (`tests/*.test.js`).

Proposed updated `package.json`:

```json
{
  "name": "kztek-labeling-studio",
  "version": "1.0.0",
  "private": true,
  "description": "KZTEK Labeling Studio - Cong cu gan nhan anh noi bo, export dataset YOLO/COCO/VOC",
  "scripts": {
    "install:all": "npm install --prefix server && npm install --prefix client",
    "dev:server": "npm run dev --prefix server",
    "dev:client": "npm run dev --prefix client",
    "build:client": "npm run build --prefix client",
    "start": "npm run build:client && npm run start --prefix server",
    "test": "npm run test:server && npm run test:client",
    "test:client": "npm run test --prefix client",
    "test:server": "node --test tests/*.test.js"
  }
}
```

### 4.3 Detailed Script Analysis & Cross-Platform Verification

1. **`npm run test:client`**
   - Command: `npm run test --prefix client`
   - Behavior: Executes `client/package.json` script `"test": "vitest run"`.
   - Output: Executes Vitest in single-run mode across all `src/**/*.{test,spec}.{js,ts,jsx,tsx}` files and exits with code 0 on success or 1 on failure.

2. **`npm run test:server`**
   - Command: `node --test tests/*.test.js`
   - Behavior: Uses Node.js native test runner (`node --test`) to discover and run all 5 server/integration test files in `tests/`:
     - `tests/auth.test.js`
     - `tests/m1_backend.test.js`
     - `tests/m1_challenger_stress.test.js`
     - `tests/m3_dashboard.test.js`
     - `tests/m3_challenger_adversarial.test.js`
   - Cross-Platform Note: `node --test` is built into Node 18+ and handles file globbing consistently across Windows CMD, PowerShell, and Unix shells.

3. **`npm test`**
   - Command: `npm run test:server && npm run test:client`
   - Behavior: First runs the server integration test suite (`test:server`). If all server tests pass (exit code 0), it proceeds to run the client unit test suite (`test:client`). If server tests fail, execution aborts immediately, propagating the non-zero exit code.
   - Sequential Execution (`&&`): Avoids terminal output interleaving and server port collision during test setup.

---

## 5. Summary of Proposed Implementations

| Script Name | Target Command | Target Scope | Output Expectation |
|-------------|----------------|--------------|-------------------|
| `test:client` | `npm run test --prefix client` | Client Vitest suites (`client/src/**/*.test.ts(x)`) | Vitest execution log + summary |
| `test:server` | `node --test tests/*.test.js` | Server integration suites (`tests/*.test.js`) | Node test runner execution log |
| `test` | `npm run test:server && npm run test:client` | Full suite (Server + Client) | Combined sequential pass report |

---

## 6. Implementation Roadmap for Milestone 4 Implementers

1. **Root `package.json` Update:**
   - Add `"test"`, `"test:client"`, and `"test:server"` to root `package.json`.
2. **Client Test Files Creation / Organization:**
   - Ensure component test files follow `*.test.tsx` / `*.test.ts` naming in `client/src/`.
   - Organize unit tests into `client/src/context/ThemeContext.test.tsx`, `client/src/components/dashboard/KPICard.test.tsx`, etc.
3. **Execution Verification:**
   - Execute `npm run test:client`, `npm run test:server`, and `npm test` to verify 100% pass rate.

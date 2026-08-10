# Handoff Report — Milestone 4 Survey: Vitest Setup & Root Test Script Wiring

## 1. Observation

### 1.1 Root `package.json`
- **File**: `package.json` (lines 1-14)
- **Current Content**:
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
      "start": "npm run build:client && npm run start --prefix server"
    }
  }
  ```
- **Observations**:
  - Missing `"type": "module"`, causing Node warning `[MODULE_TYPELESS_PACKAGE_JSON]` when running test scripts in root context.
  - Missing test script entrypoints: `"test"`, `"test:client"`, `"test:server"`.

### 1.2 Client `package.json` & `vite.config.ts`
- **File**: `client/package.json` (lines 1-27)
- **Current Dependencies**:
  - Dependencies: `clsx`, `lucide-react`, `react`, `react-dom`, `react-router-dom`, `recharts`.
  - DevDependencies: `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `typescript`, `vite`.
  - Missing test packages: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@types/node`.
- **File**: `client/vite.config.ts` (lines 1-19)
  ```typescript
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';

  export default defineConfig({
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': 'http://localhost:4000',
        '/uploads': 'http://localhost:4000',
      },
    },
  });
  ```
- **Observations**: Lacks Vitest `test` configuration object.

### 1.3 Server `package.json` & Existing Backend Tests
- **File**: `server/package.json` (lines 1-27)
  - Missing `"test"` script.
- **Directory**: `tests/` contains 6 backend test suites:
  1. `tests/auth.test.js` (1412 lines, 210 tests passed via `node tests/auth.test.js`)
  2. `tests/m1_backend.test.js` (240 lines, 27 tests passed)
  3. `tests/m1_challenger_stress.test.js` (406 lines, stress test suite)
  4. `tests/m1_sanitization_test.js` (86 lines, query sanitization test)
  5. `tests/m3_dashboard.test.js` (287 lines, 5 tests passed via `node --test tests/m3_dashboard.test.js`)
  6. `tests/m3_challenger_adversarial.test.js` (269 lines, 13 tests passed via `node --test tests/m3_challenger_adversarial.test.js`)

### 1.4 Existing Client Unit Test
- **File**: `client/src/components/dashboard/dashboard-charts.test.tsx` (224 lines)
- **Observations**: Uses a custom `runTest` harness and `ReactDOMServer.renderToStaticMarkup`. Works standalone, but can be seamlessly integrated into Vitest with standard `describe`/`it`/`expect` assertions.

---

## 2. Logic Chain

1. **Root Script Standard Requirement**: Feature #9 in `PROJECT.md` requires unified root test scripts (`npm test`, `npm run test:client`, `npm run test:server`).
2. **Client Test Runner Choice**: Vitest is natively integrated with Vite 5. Adding Vitest + React Testing Library + `jsdom` to `client/` allows standard execution of TSX component unit tests without transpilation steps.
3. **Vitest Config Integration**: Adding `/// <reference types="vitest" />` and `test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] }` to `client/vite.config.ts` allows Vite to serve both build/dev and Vitest test runner seamlessly.
4. **DOM Polyfills in Setup**: Recharts components and responsive containers rely on DOM primitives (`ResizeObserver`, `window.matchMedia`) that are not present by default in `jsdom`. Creating `client/src/test/setup.ts` with polyfills ensures zero test crashes when running component tests.
5. **Server Test Script Wiring**: Node 18/20/22 native test runner (`node --test`) executes ES module test files under `tests/*.test.js` natively. Wiring `server/package.json`'s `"test"` script to `node --test ../tests/*.test.js` enables standard test execution for the backend.
6. **Root Package.json Integration**: Setting `"type": "module"` in root `package.json` fixes Node's typeless package JSON warning. Delegating root scripts to `--prefix client` and `--prefix server` ensures clean project-wide test execution (`npm test`).

---

## 3. Caveats

- **Network Mode**: Installing new npm packages (`vitest`, `@testing-library/react`, `jsdom`, etc.) in `client/` requires npm registry access. If operating offline or with cached node_modules, standard npm install flags or cached tarballs should be used.
- **Port Isolation**: Server integration tests spin up HTTP servers on ports 4100, 4102, 4103, 4108, 4200. Port availability is required when running `npm run test:server`.
- **No Source Code Changes Made**: In accordance with explorer read-only constraints, proposed configurations and refactorings are provided below for the implementer agent to execute.

---

## 4. Conclusion & Proposed Implementation Plan

### 4.1 Root `package.json` Updates
```json
{
  "name": "kztek-labeling-studio",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "KZTEK Labeling Studio - Cong cu gan nhan anh noi bo, export dataset YOLO/COCO/VOC",
  "scripts": {
    "install:all": "npm install --prefix server && npm install --prefix client",
    "dev:server": "npm run dev --prefix server",
    "dev:client": "npm run dev --prefix client",
    "build:client": "npm run build --prefix client",
    "start": "npm run build:client && npm run start --prefix server",
    "test": "npm run test:client && npm run test:server",
    "test:client": "npm run test --prefix client",
    "test:server": "npm run test --prefix server"
  }
}
```

### 4.2 `server/package.json` Updates
Add `"test"` script:
```json
{
  "name": "kztek-labeling-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "migrate": "node src/migrate.js",
    "test": "node --test ../tests/*.test.js"
  },
  "dependencies": { ... }
}
```

### 4.3 `client/package.json` Updates
Add devDependencies & test scripts:
```json
{
  "name": "kztek-labeling-client",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "lucide-react": "^1.28.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "recharts": "^3.10.1"
  },
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
}
```

### 4.4 `client/vite.config.ts` Updates
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
});
```

### 4.5 New Setup File: `client/src/test/setup.ts`
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

---

## 5. Verification Method

1. **Verify Client Vitest Execution**:
   - Command: `npm run test:client`
   - Target result: Vitest runs and all tests in `client/src/components/dashboard/dashboard-charts.test.tsx` pass.

2. **Verify Server Test Suite Execution**:
   - Command: `npm run test:server`
   - Target result: `node --test` runs all test suites in `tests/*.test.js` and reports zero failures.

3. **Verify Root Full Test Suite Execution**:
   - Command: `npm test`
   - Target result: Sequentially triggers `npm run test:client` followed by `npm run test:server` and completes with exit code 0.

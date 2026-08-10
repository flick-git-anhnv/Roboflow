## 2026-08-06T02:22:15Z
<USER_REQUEST>
You are Worker for Milestone 4 (Client Performance Optimization & Testing Infrastructure).
Working directory: e:\KZTEK\Code_Git\Roboflow - Copy\.agents\worker_m4
Workspace root: e:\KZTEK\Code_Git\Roboflow - Copy

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Target Scope & Instructions:
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. Read Explorer analysis reports:
   - e:\KZTEK\Code_Git\Roboflow - Copy\.agents\explorer_m4_1\analysis.md
   - e:\KZTEK\Code_Git\Roboflow - Copy\.agents\explorer_m4_2\analysis.md
3. Decompose monolithic `client/src/pages/AnnotatorPage.tsx` into modular components under `client/src/pages/annotator/` (hooks, components, utils) and maintain wrapper in `AnnotatorPage.tsx`.
4. Decompose monolithic `client/src/pages/ProjectDetailPage.tsx` into modular components under `client/src/pages/project-detail/` (hooks, components) and maintain wrapper in `ProjectDetailPage.tsx`.
5. Implement route lazy loading (`React.lazy()` and `<Suspense fallback={<PageFallback />}>`) in `client/src/App.tsx`.
6. Configure Rollup `manualChunks` (`vendor-react`, `vendor-recharts`, `vendor-icons`, `vendor-utils`) in `client/vite.config.ts` to eliminate >500kB bundle size warnings.
7. Setup Vitest and React Testing Library in `client/package.json` & `client/vite.config.ts`, add client unit tests in `client/src/__tests__/`.
8. Update root `package.json` scripts:
   - `"test": "npm run test:server && npm run test:client"`
   - `"test:server": "node --test tests/auth.test.js tests/m1_backend.test.js tests/m3_dashboard.test.js tests/m3_challenger_adversarial.test.js"`
   - `"test:client": "npm --prefix client run test:run"` (or `npm --prefix client test`)
9. Run client build (`npm --prefix client run build`) and test suites (`npm test`).
10. Document all changes, build bundle outputs, test results, and layout compliance in `e:\KZTEK\Code_Git\Roboflow - Copy\.agents\worker_m4\handoff.md`.
</USER_REQUEST>

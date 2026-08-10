# Handoff Report — Startup & Server Hardening Investigation (Milestone 5)

**Agent ID**: `explorer_m5_1`  
**Date**: 2026-08-06  
**Target Workspace**: `e:\KZTEK\Code_Git\Roboflow - Copy`  

---

## 1. Observation

### 1.1 Entrypoints & Startup Scripts
- **`server/src/index.js` (lines 73-76)**:
  ```javascript
  app.listen(PORT, () => {
    console.log(`KZTEK Labeling Studio server running at http://localhost:${PORT}`);
    startInferenceService();
  });
  ```
  `app.listen(PORT)` does not register an `'error'` event listener on the returned `http.Server` instance.
- **Root `server.log` (lines 5-26)**:
  ```text
  node:events:486
        throw er; // Unhandled 'error' event
        ^

  Error: listen EADDRINUSE: address already in use :::4000
      at Server.setupListenHandle [as _listen2] (node:net:1940:16)
      ...
  ```
  Root `server.log` currently contains an unhandled `EADDRINUSE` crash stack trace caused when port 4000 was already occupied.
- **Process Exception Handlers in `server/src/index.js`**:
  `server/src/index.js` handles `process.on('exit')`, `SIGINT`, and `SIGTERM` (lines 65-71), but **lacks `unhandledRejection` and `uncaughtException`** process error listeners.
- **Missing Verification Script**:
  `scripts/verify-startup.js` **does not exist** in the repository. No directory `scripts/` exists under the project root.
- **Database Connection & Auto-Migration (`server/src/db.js` line 586)**:
  `runMigrations(db)` is imported from `./migrate.js` and executed synchronously at top-level inside `server/src/db.js` line 586 when `db.js` is imported by `server/src/app.js` line 8.
- **Migrations Directory (`server/migrations/`)**:
  Contains two migration SQL files:
  1. `001_create_jobs.sql` (creates `jobs` table & indexes).
  2. `002_add_file_hash_and_indexes.sql` (adds `images.file_hash` & performance indexes).
  Both execute successfully via `runMigrations(db)` in `server/src/migrate.js` with WAL checkpointing, backup retention (`app.db.bak-YYYYMMDD-HHmmss`), and row count data loss checks.
- **Slow Request Logger (`server/src/middleware/slowLogger.js`)**:
  - Middleware registered in `app.js` line 69 (`app.use(slowRequestLogger)`).
  - Default warning threshold: `SLOW_THRESHOLD_MS = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS || '500', 10)`.
  - Logs requests exceeding 500ms duration to console (`\x1b[33m[WARN] [SLOW_REQUEST] ...\x1b[0m`) and appends to `path.join(DATA_DIR, 'server.log')` (`server/data/server.log`).
- **Client Startup & Build**:
  - `client/vite.config.ts`: Vite dev server configured for port 5173 with API proxies to `http://localhost:4000` (`/api`, `/uploads`).
  - Production mode: `npm run start` calls `npm run build --prefix client` (`tsc -b && vite build`) and then `npm run start --prefix server` (`node src/index.js`). Static assets served from `client/dist`.

---

## 2. Logic Chain

1. **Port Conflict Vulnerability**:
   - *Observation*: `server/src/index.js` calls `app.listen(PORT, ...)` without catching `'error'` event. Root `server.log` shows an unhandled `EADDRINUSE` crash.
   - *Reasoning*: If port 4000 is occupied by another process, Node emits an unhandled `'error'` event on the server object. Node terminates the process immediately with an uncaught exception stack trace instead of providing a friendly error message and exit code 1.
2. **Unhandled Promise Rejection Risk**:
   - *Observation*: `server/src/index.js` contains no `process.on('unhandledRejection')` handler.
   - *Reasoning*: Async route handlers or background background processes (such as image thumbnail generation, auto-labeling inference requests, or dataset zip export) that reject without a `.catch()` block will cause unhandled promise rejection warnings or process crash.
3. **Missing Automated Pre-Flight / Startup Verification**:
   - *Observation*: `scripts/verify-startup.js` is missing from the workspace.
   - *Reasoning*: Without an automated startup verification script, developers and CI/CD pipelines cannot programmatically verify database migrations, port availability, HTTP `/api/health` response, client build output (`client/dist`), and log cleanliness before or immediately after starting the server.
4. **Log File Location Discrepancy & Cleanliness**:
   - *Observation*: `slowLogger.js` writes to `path.join(DATA_DIR, 'server.log')` (e.g. `server/data/server.log`), while an uncleaned `server.log` file exists in the repository root directory containing crash traces.
   - *Reasoning*: Having crash stack traces in root `server.log` violates the log cleanliness objective. Standardizing the log destination, cleaning root crash logs, and adding a log verification step ensures clean operation.

---

## 3. Caveats

- **External Python Environment**: The Python FastAPI inference service (`server/src/python/inference_service.py`) requires `fastapi`, `uvicorn`, and `ultralytics`. If Python or dependencies are missing, `server/src/index.js` catches `spawn` errors and logs a warning message without crashing Node, but Python auto-labeling features will return HTTP 503.
- **Port Fallback vs Fixed Port**: If backend port is changed dynamically upon `EADDRINUSE`, `client/vite.config.ts` proxy targets (`http://localhost:4000`) will fail unless `VITE_PROXY_TARGET` or environment configuration is also updated. Therefore, explicit port detection with clean error messaging is preferred over silent port shifting.

---

## 4. Conclusion

The application startup mechanism is structurally sound (database auto-migrations execute cleanly via `runMigrations(db)` inside `db.js`, slow logger middleware functions at >500ms threshold, and client static building works via Vite). However, **4 critical hardening gaps** must be implemented by Milestone 5 Worker:

1. **Create `scripts/verify-startup.js`**: An automated node script verifying DB schema readiness, port availability, server health check (`/api/health`), client `dist` existence, and log cleanliness.
2. **Port Conflict (`EADDRINUSE`) Hardening**: Register explicit `server.on('error', ...)` in `server/src/index.js` to catch `EADDRINUSE`, log a clean diagnostic message (`[ERROR] Port 4000 is already in use`), and exit gracefully with status code 1.
3. **Global Process Exception & Rejection Handlers**: Add `process.on('unhandledRejection')` and `process.on('uncaughtException')` in `server/src/index.js` to prevent unhandled node crashes and format log entries cleanly.
4. **Log Cleanliness & Script Integration**: Delete/archive dirty root `server.log` file, standardize log output path, and add `"verify:startup": "node scripts/verify-startup.js"` to root and server `package.json`.

---

## 5. Verification Method

To independently verify these findings:

1. **Verify Missing Script**:
   Check if `scripts/verify-startup.js` exists:
   ```powershell
   Test-Path "e:\KZTEK\Code_Git\Roboflow - Copy\scripts\verify-startup.js"
   # Output: False
   ```
2. **Verify Root `server.log` Crash Trace**:
   Inspect line 9 of `e:\KZTEK\Code_Git\Roboflow - Copy\server.log`:
   ```powershell
   Get-Content "e:\KZTEK\Code_Git\Roboflow - Copy\server.log" | Select-String "EADDRINUSE"
   ```
3. **Verify Database Auto-Migration Logic**:
   Inspect `server/src/db.js` line 586 and `server/src/migrate.js`:
   ```powershell
   Get-Content "e:\KZTEK\Code_Git\Roboflow - Copy\server\src\db.js" | Select-String "runMigrations"
   ```
4. **Verify Slow Logger Threshold**:
   Inspect `server/src/middleware/slowLogger.js` line 6:
   ```powershell
   Get-Content "e:\KZTEK\Code_Git\Roboflow - Copy\server\src\middleware\slowLogger.js" | Select-String "SLOW_THRESHOLD_MS"
   ```
5. **Run Integration Tests**:
   Execute existing test suite to confirm baseline environment health:
   ```powershell
   npm test
   ```

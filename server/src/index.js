import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { app } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const INFERENCE_PORT = process.env.INFERENCE_PORT || '8001';
const USE_LEGACY_INFER = process.env.USE_LEGACY_INFER === '1';

// ─── Inference service lifecycle ──────────────────────────────────────────────

let _inferenceProcess = null;

/**
 * Spawn Python FastAPI inference service (inference_service.py).
 * Không block — service chạy song song với Node server.
 * autolabel.js kiểm tra health tại request time; trả 503 nếu chưa sẵn sàng.
 */
function startInferenceService() {
  if (USE_LEGACY_INFER) {
    console.log('[inference] USE_LEGACY_INFER=1 — dùng spawn-per-request (legacy mode)');
    return;
  }

  const scriptPath = path.join(__dirname, 'python', 'inference_service.py');
  console.log(`[inference] Spawning inference service (port ${INFERENCE_PORT})...`);

  _inferenceProcess = spawn(PYTHON_BIN, [scriptPath], {
    env: { ...process.env, INFERENCE_PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  _inferenceProcess.stdout.on('data', (chunk) => {
    chunk.toString().trim().split('\n').forEach((line) => {
      if (line) console.log(`[inference] ${line}`);
    });
  });
  _inferenceProcess.stderr.on('data', (chunk) => {
    chunk.toString().trim().split('\n').forEach((line) => {
      if (line) console.error(`[inference] ${line}`);
    });
  });
  _inferenceProcess.on('exit', (code, signal) => {
    console.log(`[inference] Service stopped (code=${code} signal=${signal})`);
    _inferenceProcess = null;
  });
  _inferenceProcess.on('error', (err) => {
    console.error(`[inference] Failed to spawn: ${err.message}`);
    console.error('[inference] Đảm bảo đã cài: pip install fastapi uvicorn ultralytics');
    _inferenceProcess = null;
  });
}

function stopInferenceService() {
  if (_inferenceProcess) {
    console.log('[inference] Stopping inference service...');
    _inferenceProcess.kill('SIGTERM');
    _inferenceProcess = null;
  }
}

// Dọn dẹp inference service khi Node tắt
process.on('exit', stopInferenceService);
['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    stopInferenceService();
    process.exit(0);
  });
});

// Process error listeners to prevent silent server crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[server] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught Exception:', err);
});

const server = app.listen(PORT, () => {
  console.log(`KZTEK Labeling Studio server running at http://localhost:${PORT}`);
  startInferenceService();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} is already in use (EADDRINUSE). Please terminate the occupying process or specify a different PORT.`);
    process.exit(1);
  } else {
    console.error('[server] Server startup error:', err);
    process.exit(1);
  }
});


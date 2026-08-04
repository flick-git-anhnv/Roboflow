import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { UPLOAD_DIR } from './db.js';
import projectsRouter from './routes/projects.js';
import classesRouter from './routes/classes.js';
import imagesRouter from './routes/images.js';
import annotationsRouter from './routes/annotations.js';
import exportRouter from './routes/export.js';
import statsRouter from './routes/stats.js';
import modelsRouter from './routes/models.js';
import autolabelRouter from './routes/autolabel.js';
import jobsRouter from './routes/jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
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

// ─── Express setup ────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/classes', classesRouter);
app.use('/api/projects/:projectId/images', imagesRouter);
app.use('/api/images/:imageId/annotations', annotationsRouter);
app.use('/api/projects/:projectId/export', exportRouter);
app.use('/api/projects/:projectId/stats', statsRouter);
app.use('/api/projects/:projectId/models', modelsRouter);
app.use('/api/projects/:projectId/auto-label', autolabelRouter);
app.use('/api/jobs', jobsRouter);

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => { if (err) next(); });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`KZTEK Labeling Studio server running at http://localhost:${PORT}`);
  startInferenceService();
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { UPLOAD_DIR } from './db.js';
import { authRequired } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import projectsRouter from './routes/projects.js';
import classesRouter from './routes/classes.js';
import imagesRouter from './routes/images.js';
import annotationsRouter from './routes/annotations.js';
import exportRouter from './routes/export.js';
import statsRouter from './routes/stats.js';
import modelsRouter from './routes/models.js';
import autolabelRouter from './routes/autolabel.js';
import jobsRouter from './routes/jobs.js';
import thumbnailsRouter from './routes/thumbnails.js';
import reviewsRouter from './routes/reviews.js';
import historyRouter from './routes/history.js';
import activityRouter from './routes/activity.js';
import prefillRouter from './routes/prefill.js';
import validateRouter from './routes/validate.js';
import assignmentsRouter from './routes/assignments.js';

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

// ─── Middleware stack (AD-A4 thứ tự bắt buộc) ────────────────────────────────

// 1. Helmet: security headers (CSP, X-Frame-Options, X-Content-Type-Options...)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // cho phép serve images qua /uploads
}));

// 2. CORS siết lại theo AD-A8 — chỉ cho origin trong CORS_ORIGIN
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Truy cập từ máy khác trong mạng LAN (VD http://192.168.1.20:5173) khi ở dev
// mode: cho phép origin có IP thuộc dải mạng riêng (RFC 1918), giữ nguyên
// PORT client (mặc định 5173, override qua CLIENT_PORT nếu đổi). KHÔNG áp
// dụng khi NODE_ENV=production — production luôn chỉ theo đúng CORS_ORIGIN.
const IS_PROD = process.env.NODE_ENV === 'production';
const CLIENT_PORT = process.env.CLIENT_PORT || '5173';
const LAN_ORIGIN_RE = new RegExp(
  `^https?://(192\\.168\\.\\d{1,3}\\.\\d{1,3}|10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}):${CLIENT_PORT}$`
);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl/Postman không có Origin header
    if (CORS_ORIGIN.includes(origin)) return cb(null, true);
    if (!IS_PROD && LAN_ORIGIN_RE.test(origin)) return cb(null, true);
    return cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 3. Body parser + static uploads
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

// 4. Cookie parser — phải trước authRequired để đọc được cookie kztek_token
app.use(cookieParser());

// 5. Public health endpoint — bypass auth
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// 6. Auth router — login PUBLIC; logout + me protected inside the router
app.use('/api/auth', authRouter);

// 7. authRequired global: áp cho toàn bộ /api/* còn lại (kể cả GET — AD-A4)
app.use('/api', authRequired);

// 8. Protected routes
app.use('/api/users', usersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/classes', classesRouter);
app.use('/api/projects/:projectId/images', imagesRouter);
app.use('/api/images/:imageId/annotations', annotationsRouter);
app.use('/api/projects/:projectId/export', exportRouter);
app.use('/api/projects/:projectId/stats', statsRouter);
app.use('/api/projects/:projectId/models', modelsRouter);
app.use('/api/projects/:projectId/auto-label', autolabelRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/images', thumbnailsRouter);
app.use('/api/images/:imageId', reviewsRouter);
app.use('/api/images/:imageId', historyRouter);
app.use('/api/projects/:projectId/activity', activityRouter);
app.use('/api/projects/:projectId', prefillRouter);   // STEP-4.2: prefill + default-model
app.use('/api/projects/:projectId', validateRouter);  // STEP-6.3: dataset validation
app.use('/api/projects/:projectId/assignments', assignmentsRouter); // Phân công % công việc

// ─── SPA fallback ─────────────────────────────────────────────────────────────
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

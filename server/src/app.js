import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { UPLOAD_DIR } from './db.js';
import { authRequired } from './middleware/auth.js';
import { slowRequestLogger } from './middleware/slowLogger.js';
import { checkProjectAssignment } from './middleware/projectAccess.js';

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
import dashboardRouter from './routes/dashboard.js';
import versionsRouter from './routes/versions.js';
import trainingRouter from './routes/training.js';
import workflowsRouter from './routes/workflows.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();

// ─── Middleware stack ─────────────────────────────────────────────────────────

// 1. Helmet security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// 2. CORS configuration
const PORT = process.env.PORT || 4000;
const CLIENT_PORT = process.env.CLIENT_PORT || '5173';
const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
];
const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = new Set([...defaultOrigins, ...envOrigins]);

const IS_PROD = process.env.NODE_ENV === 'production';
const LAN_ORIGIN_RE = new RegExp(
  `^https?://(192\\.168\\.\\d{1,3}\\.\\d{1,3}|10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}):(${CLIENT_PORT}|${PORT})$`
);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    if (!IS_PROD && LAN_ORIGIN_RE.test(origin)) return cb(null, true);
    try {
      const url = new URL(origin);
      if (url.port === String(PORT) || url.port === String(CLIENT_PORT)) {
        return cb(null, true);
      }
    } catch (_) {}
    return cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 3. Body parser & static uploads
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

// 4. Slow Request Logger Middleware (>500ms duration tracking)
app.use(slowRequestLogger);

// 5. Cookie parser
app.use(cookieParser());

// 6. Prevent caching for all API requests
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// 7. Public health endpoint
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// 7. Auth router
app.use('/api/auth', authRouter);

// 8. Global Auth Protection
app.use('/api', authRequired);

// 9. Protected Sub-system Routers
app.use('/api/users', usersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects', dashboardRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/projects/:projectId/classes', checkProjectAssignment, classesRouter);
app.use('/api/projects/:projectId/images', checkProjectAssignment, imagesRouter);
app.use('/api/images/:imageId/annotations', annotationsRouter);
app.use('/api/projects/:projectId/export', checkProjectAssignment, exportRouter);
app.use('/api/projects/:projectId/stats', checkProjectAssignment, statsRouter);
app.use('/api/projects/:projectId/models', checkProjectAssignment, modelsRouter);
app.use('/api/projects/:projectId/auto-label', checkProjectAssignment, autolabelRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/images', thumbnailsRouter);
app.use('/api/images/:imageId', reviewsRouter);
app.use('/api/images/:imageId', historyRouter);
app.use('/api/projects/:projectId/activity', checkProjectAssignment, activityRouter);
app.use('/api/projects/:projectId', checkProjectAssignment, prefillRouter);
app.use('/api/projects/:projectId', checkProjectAssignment, validateRouter);
app.use('/api/projects/:projectId/assignments', checkProjectAssignment, assignmentsRouter);
app.use('/api/projects/:projectId/versions', checkProjectAssignment, versionsRouter);
app.use('/api/projects/:projectId/train', checkProjectAssignment, trainingRouter);
app.use('/api/projects/:projectId/workflows', checkProjectAssignment, workflowsRouter);

// ─── SPA fallback & error handling ───────────────────────────────────────────
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

export default app;

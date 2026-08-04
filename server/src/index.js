import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPLOAD_DIR } from './db.js';
import projectsRouter from './routes/projects.js';
import classesRouter from './routes/classes.js';
import imagesRouter from './routes/images.js';
import annotationsRouter from './routes/annotations.js';
import exportRouter from './routes/export.js';
import statsRouter from './routes/stats.js';
import modelsRouter from './routes/models.js';
import autolabelRouter from './routes/autolabel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

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
});

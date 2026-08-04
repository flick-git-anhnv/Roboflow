import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'images');
export const MODEL_DIR = path.join(DATA_DIR, 'models');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(MODEL_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  hotkey TEXT
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  split TEXT NOT NULL DEFAULT 'train',
  status TEXT NOT NULL DEFAULT 'unlabeled',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  y REAL NOT NULL,
  w REAL NOT NULL,
  h REAL NOT NULL,
  type TEXT NOT NULL DEFAULT 'bbox',
  points TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id                  TEXT    PRIMARY KEY,
  project_id          TEXT    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'pending',
  total_images        INTEGER NOT NULL DEFAULT 0,
  processed           INTEGER NOT NULL DEFAULT 0,
  created_annotations INTEGER NOT NULL DEFAULT 0,
  failed              INTEGER NOT NULL DEFAULT 0,
  model_id            TEXT,
  error_msg           TEXT,
  unmatched_classes   TEXT    NOT NULL DEFAULT '[]',
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_classes_project ON classes(project_id);
CREATE INDEX IF NOT EXISTS idx_images_project ON images(project_id);
CREATE INDEX IF NOT EXISTS idx_annotations_image ON annotations(image_id);
CREATE INDEX IF NOT EXISTS idx_models_project ON models(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status  ON jobs(status);
`);

// Migration for databases created before the 'type'/'points' columns existed
const annotationCols = db.prepare("PRAGMA table_info(annotations)").all().map((c) => c.name);
if (!annotationCols.includes('type')) {
  db.exec("ALTER TABLE annotations ADD COLUMN type TEXT NOT NULL DEFAULT 'bbox'");
}
if (!annotationCols.includes('points')) {
  db.exec('ALTER TABLE annotations ADD COLUMN points TEXT');
}

const classCols = db.prepare("PRAGMA table_info(classes)").all().map((c) => c.name);
if (!classCols.includes('hotkey')) {
  db.exec('ALTER TABLE classes ADD COLUMN hotkey TEXT');
}

// On every server startup: mark any running/pending jobs as error.
// Jobs in these states were interrupted by a server restart and can never complete.
db.prepare(`
  UPDATE jobs
  SET status = 'error',
      error_msg = 'Server restarted while job was in progress',
      updated_at = datetime('now')
  WHERE status IN ('running', 'pending')
`).run();

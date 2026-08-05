import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
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

// ─── m003_add_users ────────────────────────────────────────────────────────────
// AD-A1: Schema bảng users + seed admin đầu tiên.
// Idempotent: CREATE TABLE IF NOT EXISTS + COUNT check trước khi seed.
// AD-A5: images.uploaded_by → FK users(id) để enforce owner-based delete rule.
// Synchronous: dùng bcrypt.hashSync để không làm phức tạp module init.
function m003_add_users() {
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      username       TEXT    NOT NULL UNIQUE,
      password_hash  TEXT    NOT NULL,
      display_name   TEXT    NOT NULL,
      role           TEXT    NOT NULL CHECK(role IN ('annotator','reviewer','admin')),
      color          TEXT    NOT NULL DEFAULT '#4A3F8C',
      is_active      INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login_at  TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);

  // Add uploaded_by to images if not present (AD-A5: owner-based delete)
  const imageCols = db.prepare("PRAGMA table_info(images)").all().map((c) => c.name);
  if (!imageCols.includes('uploaded_by')) {
    db.exec('ALTER TABLE images ADD COLUMN uploaded_by INTEGER REFERENCES users(id)');
  }

  // AD-A6: Seed admin đầu tiên — chỉ khi bảng users còn rỗng
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count === 0) {
    const adminUser = (process.env.AUTH_BOOTSTRAP_ADMIN_USER || 'admin').toLowerCase();
    const adminPass = process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD || 'kztek@2026';
    // hashSync blocks ~100-300ms — acceptable at startup only
    const hash = bcrypt.hashSync(adminPass, 12);

    db.prepare(
      "INSERT INTO users (username, password_hash, display_name, role, color) VALUES (?, ?, ?, 'admin', '#251C53')"
    ).run(adminUser, hash, 'Administrator');

    if (process.env.AUTH_BOOTSTRAP_ADMIN_USER && process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD) {
      console.log(`[INFO] Bootstrap admin created: ${adminUser}`);
    } else {
      console.log('############################################################');
      console.log('# [SECURITY WARN] Default admin created: admin / kztek@2026');
      console.log('# ĐỔI MẬT KHẨU NGAY LẦN LOGIN ĐẦU TIÊN');
      console.log('# Hoặc set AUTH_BOOTSTRAP_ADMIN_* trước khi restart lần đầu');
      console.log('############################################################');
    }
  }
}

m003_add_users();

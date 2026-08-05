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

export const DB_PATH = path.join(DATA_DIR, 'app.db');
export const db = new Database(DB_PATH);
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

// ─── m004_add_review_status ────────────────────────────────────────────────────
// STEP-2.3: Review workflow — thêm 4 cột review vào bảng images.
// review_status lifecycle: 'draft' → 'in_review' → 'approved' | 'rejected'
//
// ⚠️ STEP-3.5 NOTE: Sau khi STEP-3.5 thêm completed_at/completed_by vào images,
// route submit-review nên check completed_at IS NOT NULL thay vì status='labeled'.
// Hiện tại dùng status='labeled' tạm thời — ghi chú để Phase 3 cập nhật lại.
//
// reviewed_by: FK → users(id) INTEGER (nullable khi chưa review)
function m004_add_review_status() {
  const imgCols = db.prepare("PRAGMA table_info(images)").all().map((c) => c.name);
  if (!imgCols.includes('review_status')) {
    db.exec("ALTER TABLE images ADD COLUMN review_status TEXT NOT NULL DEFAULT 'draft'");
  }
  if (!imgCols.includes('review_comment')) {
    db.exec('ALTER TABLE images ADD COLUMN review_comment TEXT');
  }
  if (!imgCols.includes('reviewed_by')) {
    // FK → users(id): SQLite không enforce FK qua ALTER TABLE CHECK,
    // nhưng foreign_keys=ON đảm bảo runtime constraint khi INSERT/UPDATE.
    db.exec('ALTER TABLE images ADD COLUMN reviewed_by INTEGER REFERENCES users(id)');
  }
  if (!imgCols.includes('reviewed_at')) {
    db.exec('ALTER TABLE images ADD COLUMN reviewed_at TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_review_status ON images(review_status)');
}

m004_add_review_status();

// ─── m005_phase3_schema ────────────────────────────────────────────────────────
// STEP-3.1: Schema cho Phase 3 (History & Activity Log).
//   1. Cột `version INTEGER NOT NULL DEFAULT 0` trên `annotations` — optimistic
//      locking (STEP-3.4). Existing rows nhận DEFAULT 0; mỗi save sẽ tăng lên 1+.
//   2. Bảng `annotation_history` — SNAPSHOT toàn bộ annotations của 1 ảnh mỗi save
//      (ADR AD-5: không diff, revert = 1 query). Retention 200 version/ảnh qua
//      pruneAnnotationHistory() được gọi bởi STEP-3.2.
//   3. Bảng `activity_log` — audit trail cấp project (route viết ở STEP-3.3).
//
// Idempotent: check PRAGMA table_info + sqlite_master trước ALTER/CREATE.
// Backup: tạo app.db.bak-{YYYYMMDD-HHmmss} TRƯỚC khi chạy (chỉ khi cần migrate).
// Verify: đếm row count trước/sau — DỪNG + throw nếu bảng nào bị mất dữ liệu
//         (CTO condition #1 từ ADR APPROVED 2026-08-04).
function m005_phase3_schema() {
  // === Idempotent guard: nếu đã migrate rồi thì bỏ qua ===
  const annotCols = db.prepare('PRAGMA table_info(annotations)').all().map((c) => c.name);
  const existingTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);
  const hasVersion     = annotCols.includes('version');
  const hasHistory     = existingTables.includes('annotation_history');
  const hasActivityLog = existingTables.includes('activity_log');

  if (hasVersion && hasHistory && hasActivityLog) return; // already migrated

  // === Backup DB trước khi thay đổi schema ===
  const now = new Date();
  const p2  = (n) => String(n).padStart(2, '0');
  const ts  = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
  const bakPath = `${DB_PATH}.bak-${ts}`;

  // Checkpoint WAL → main file trước khi copy để bản backup nhất quán
  try { db.pragma('wal_checkpoint(FULL)'); } catch (_) { /* ignore */ }
  fs.copyFileSync(DB_PATH, bakPath);

  // Giữ 5 backup gần nhất, xoá cũ hơn
  try {
    const bakFiles = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.startsWith('app.db.bak-'))
      .sort()     // lexicographic = chronological (YYYYMMDD-HHmmss)
      .reverse(); // newest first
    for (const old of bakFiles.slice(5)) {
      try { fs.unlinkSync(path.join(DATA_DIR, old)); } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore if DATA_DIR unreadable */ }

  console.log(`[INFO] m005: DB backed up → ${bakPath}`);

  // === Row count TRƯỚC migration (CTO condition #1) ===
  const TRACKED = ['projects', 'classes', 'images', 'annotations', 'models', 'jobs', 'users'];
  const before = {};
  for (const t of TRACKED) {
    try { before[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n; }
    catch (_) { before[t] = null; } // bảng chưa tồn tại
  }
  console.log('[INFO] m005: Row counts BEFORE migration:', JSON.stringify(before));

  // === Chạy migration trong transaction ===
  db.transaction(() => {
    // 1. Thêm cột version vào annotations (idempotent — guard phía trên)
    if (!hasVersion) {
      db.exec('ALTER TABLE annotations ADD COLUMN version INTEGER NOT NULL DEFAULT 0');
    }

    // 2. Bảng annotation_history — SNAPSHOT strategy (ADR AD-5)
    //    actor_id nullable: các save trước khi auth được triển khai không có user
    if (!hasHistory) {
      db.exec(`
        CREATE TABLE annotation_history (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          image_id   TEXT    NOT NULL REFERENCES images(id) ON DELETE CASCADE,
          version    INTEGER NOT NULL,
          snapshot   TEXT    NOT NULL,
          actor_id   INTEGER REFERENCES users(id),
          created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_ann_history_image   ON annotation_history(image_id);
        CREATE INDEX idx_ann_history_img_ver ON annotation_history(image_id, version DESC);
      `);
    }

    // 3. Bảng activity_log — audit trail cấp project (route: STEP-3.3)
    //    actor_id nullable: các event trước khi auth được triển khai
    if (!hasActivityLog) {
      db.exec(`
        CREATE TABLE activity_log (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          actor_id   INTEGER REFERENCES users(id),
          action     TEXT    NOT NULL,
          detail     TEXT,
          created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_activity_log_project ON activity_log(project_id);
        CREATE INDEX idx_activity_log_action  ON activity_log(action);
      `);
    }
  })();

  // === Row count SAU migration (CTO condition #1) ===
  const after = {};
  for (const t of TRACKED) {
    try { after[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n; }
    catch (_) { after[t] = null; }
  }
  console.log('[INFO] m005: Row counts AFTER  migration:', JSON.stringify(after));

  // === Verify: không bảng nào được mất dữ liệu ===
  for (const t of TRACKED) {
    if (before[t] === null) continue;          // bảng chưa tồn tại trước → skip
    if (after[t] !== null && after[t] < before[t]) {
      const msg =
        `[CRITICAL] DATA LOSS in table "${t}": ${before[t]} rows → ${after[t]} rows. ` +
        `Restore from backup: ${bakPath}`;
      console.error(msg);
      // Throw để ngăn server khởi động với dữ liệu bị mất (CTO requirement)
      throw new Error(msg);
    }
  }

  console.log('[INFO] m005: Migration complete — data integrity verified ✓');
}

m005_phase3_schema();

// ─── m006_add_image_done_columns ───────────────────────────────────────────────
// STEP-3.5: Đánh dấu ảnh "Xong" — 2 cột nullable vào bảng `images`.
//   completed_at TEXT  — ISO datetime (nullable, NULL = chưa done)
//   completed_by INT   — FK → users(id) (nullable)
//
// ADR (Image done status v3): dùng 2 cột riêng, KHÔNG mở rộng enum `status` —
//   tách biệt rõ "đã label" (status=labeled) và "người label xác nhận xong" (completed_at).
//
// Idempotent: check PRAGMA table_info trước ALTER TABLE.
// Verify: row count TRACKED trước/sau (CTO condition #1, same pattern m005).
function m006_add_image_done_columns() {
  const imgCols = db.prepare('PRAGMA table_info(images)').all().map((c) => c.name);
  const needsCompletedAt = !imgCols.includes('completed_at');
  const needsCompletedBy = !imgCols.includes('completed_by');

  if (!needsCompletedAt && !needsCompletedBy) return; // already migrated

  // === Row count BEFORE migration ===
  const TRACKED = ['projects', 'classes', 'images', 'annotations', 'models', 'jobs', 'users'];
  const before = {};
  for (const t of TRACKED) {
    try { before[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n; }
    catch (_) { before[t] = null; }
  }
  console.log('[INFO] m006: Row counts BEFORE migration:', JSON.stringify(before));

  db.transaction(() => {
    if (needsCompletedAt) {
      db.exec('ALTER TABLE images ADD COLUMN completed_at TEXT');
    }
    if (needsCompletedBy) {
      db.exec('ALTER TABLE images ADD COLUMN completed_by INTEGER REFERENCES users(id)');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_images_completed_at ON images(completed_at)');
  })();

  // === Row count AFTER migration ===
  const after = {};
  for (const t of TRACKED) {
    try { after[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n; }
    catch (_) { after[t] = null; }
  }
  console.log('[INFO] m006: Row counts AFTER  migration:', JSON.stringify(after));

  // === Verify: không bảng nào được mất dữ liệu (CTO condition #1) ===
  for (const t of TRACKED) {
    if (before[t] === null) continue;
    if (after[t] !== null && after[t] < before[t]) {
      const msg =
        `[CRITICAL] DATA LOSS in table "${t}": ${before[t]} rows → ${after[t]} rows. ` +
        `Migration: m006_add_image_done_columns`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  console.log('[INFO] m006: Migration complete — data integrity verified ✓');
}

m006_add_image_done_columns();

// ─── m007_detect_cache ─────────────────────────────────────────────────────────
// STEP-4.1: Cache kết quả detect theo (image_id, model_id).
//
// raw_detections: JSON text — toàn bộ box + conf score gốc, KHÔNG áp threshold.
// Node.js gọi inference với CACHE_RAW_CONF=0.01, lưu raw vào đây, sau đó tự
// lọc theo conf threshold của user ở tầng application. Cho phép đổi conf/IoU
// mà không cần detect lại.
//
// Unique index trên (image_id, model_id): 1 entry/cặp ảnh-model.
// ON DELETE CASCADE trên image_id → cache tự xóa khi ảnh bị xóa.
// ON DELETE CASCADE trên model_id → cache tự xóa khi model bị xóa.
//
// Idempotent: kiểm tra sqlite_master trước khi CREATE.
// Verify: row count trước/sau (CTO condition #1 pattern — dù bảng mới không có
// risk mất dữ liệu existing, giữ pattern nhất quán với m005/m006).
function m007_detect_cache() {
  const existingTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);
  if (existingTables.includes('detect_cache')) return; // already migrated

  // Row count BEFORE (theo pattern CTO condition #1)
  const TRACKED = ['projects', 'classes', 'images', 'annotations', 'models', 'jobs', 'users'];
  const before = {};
  for (const t of TRACKED) {
    try { before[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n; }
    catch (_) { before[t] = null; }
  }
  console.log('[INFO] m007: Row counts BEFORE migration:', JSON.stringify(before));

  db.exec(`
    CREATE TABLE detect_cache (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id       TEXT    NOT NULL REFERENCES images(id)  ON DELETE CASCADE,
      model_id       TEXT    NOT NULL REFERENCES models(id)  ON DELETE CASCADE,
      raw_detections TEXT    NOT NULL,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX idx_detect_cache_img_model ON detect_cache(image_id, model_id);
    CREATE INDEX idx_detect_cache_image  ON detect_cache(image_id);
    CREATE INDEX idx_detect_cache_model  ON detect_cache(model_id);
  `);

  // Row count AFTER
  const after = {};
  for (const t of TRACKED) {
    try { after[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n; }
    catch (_) { after[t] = null; }
  }
  console.log('[INFO] m007: Row counts AFTER  migration:', JSON.stringify(after));

  for (const t of TRACKED) {
    if (before[t] === null) continue;
    if (after[t] !== null && after[t] < before[t]) {
      const msg =
        `[CRITICAL] DATA LOSS in table "${t}": ${before[t]} rows → ${after[t]} rows. ` +
        `Migration: m007_detect_cache`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  console.log('[INFO] m007: detect_cache table created ✓');
}

m007_detect_cache();

// ─── Retention helper: annotation_history ─────────────────────────────────────
// Gọi bởi STEP-3.2 (routes/history.js) ngay sau mỗi INSERT INTO annotation_history.
// Giữ tối đa 200 version gần nhất mỗi ảnh (ADR AD-5 retention policy).
export const HISTORY_MAX_VERSIONS = 200;

// ─── Activity log helper ───────────────────────────────────────────────────────
// Gọi bởi routes/images.js, routes/export.js, routes/reviews.js (STEP-3.3).
// Non-blocking: lỗi ghi log KHÔNG throw để không ảnh hưởng main flow.
export function logActivity(projectId, actorId, action, detail) {
  try {
    db.prepare(
      'INSERT INTO activity_log (project_id, actor_id, action, detail) VALUES (?, ?, ?, ?)'
    ).run(projectId, actorId ?? null, action, detail ? JSON.stringify(detail) : null);
  } catch (e) {
    console.error('[activity_log] Insert failed:', e.message);
  }
}

export function pruneAnnotationHistory(imageId) {
  const n = db
    .prepare('SELECT COUNT(*) AS n FROM annotation_history WHERE image_id = ?')
    .get(imageId)?.n ?? 0;

  if (n > HISTORY_MAX_VERSIONS) {
    db.prepare(`
      DELETE FROM annotation_history
      WHERE image_id = ?
        AND id NOT IN (
          SELECT id FROM annotation_history
          WHERE image_id = ?
          ORDER BY version DESC
          LIMIT ?
        )
    `).run(imageId, imageId, HISTORY_MAX_VERSIONS);
  }
}

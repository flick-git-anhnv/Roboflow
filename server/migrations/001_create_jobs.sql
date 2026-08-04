-- Migration 001: Create jobs table for persisting auto-label job state
-- Idempotent: CREATE TABLE IF NOT EXISTS (safe to run multiple times)

CREATE TABLE IF NOT EXISTS jobs (
  id                  TEXT    PRIMARY KEY,
  project_id          TEXT    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'pending',   -- pending | running | done | error
  total_images        INTEGER NOT NULL DEFAULT 0,
  processed           INTEGER NOT NULL DEFAULT 0,           -- ảnh đã xử lý xong (done counter)
  created_annotations INTEGER NOT NULL DEFAULT 0,           -- annotation đã tạo
  failed              INTEGER NOT NULL DEFAULT 0,           -- ảnh bị lỗi inference
  model_id            TEXT,
  error_msg           TEXT,
  unmatched_classes   TEXT    NOT NULL DEFAULT '[]',        -- JSON array tên class không map được
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status  ON jobs(status);

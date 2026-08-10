-- Migration 004: Roboflow Advanced Features (Smart Annotations, Dataset Versioning, Model Training & Visual Workflows)

-- 1. Create dataset_versions table
CREATE TABLE IF NOT EXISTS dataset_versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    version_name TEXT NOT NULL,
    train_split REAL DEFAULT 0.7,
    val_split REAL DEFAULT 0.2,
    test_split REAL DEFAULT 0.1,
    augmentation_config TEXT,
    preprocessing_config TEXT,
    images_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 2. Create model_train_jobs table
CREATE TABLE IF NOT EXISTS model_train_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    dataset_version_id TEXT NOT NULL,
    model_architecture TEXT NOT NULL DEFAULT 'yolov8n',
    status TEXT CHECK(status IN ('queued', 'training', 'completed', 'failed')) DEFAULT 'queued',
    epochs INTEGER DEFAULT 100,
    batch_size INTEGER DEFAULT 16,
    metrics TEXT,
    weights_path TEXT,
    logs TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id)
);

-- 3. Create cv_workflows table
CREATE TABLE IF NOT EXISTS cv_workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    graph_nodes TEXT NOT NULL DEFAULT '[]',
    graph_edges TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 4. Add columns to existing tables
ALTER TABLE images ADD COLUMN auto_label_status TEXT DEFAULT 'manual';
ALTER TABLE annotations ADD COLUMN source TEXT DEFAULT 'manual';

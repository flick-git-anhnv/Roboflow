-- Migration 002: Add images.file_hash column and composite performance indexes
-- Target: Roboflow Upgrade Milestone 1 (R5)

ALTER TABLE images ADD COLUMN file_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_images_file_hash ON images(file_hash);
CREATE INDEX IF NOT EXISTS idx_images_project_status_split ON images(project_id, status, split);
CREATE INDEX IF NOT EXISTS idx_annotations_class_image ON annotations(class_id, image_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_proj_created ON activity_log(project_id, created_at DESC);

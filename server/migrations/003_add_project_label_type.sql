-- Migration 003: Add projects.label_type and annotations.text_content columns
-- Target: Roboflow Upgrade - Multiple Project Labeling Types

ALTER TABLE projects ADD COLUMN label_type TEXT NOT NULL DEFAULT 'bbox';
ALTER TABLE annotations ADD COLUMN text_content TEXT;

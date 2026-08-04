export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  image_count: number;
  labeled_count: number;
  class_count: number;
}

export interface ClassLabel {
  id: string;
  project_id: string;
  name: string;
  color: string;
  sort_order: number;
  hotkey: string | null;
}

export type Split = 'train' | 'valid' | 'test';
export type ImageStatus = 'unlabeled' | 'labeled';

export interface ImageItem {
  id: string;
  project_id: string;
  filename: string;
  original_name: string;
  width: number;
  height: number;
  split: Split;
  status: ImageStatus;
  created_at: string;
  class_ids: string[];
}

export type AnnotationType = 'bbox' | 'quad';

export interface Point {
  x: number;
  y: number;
}

export interface Annotation {
  id: string;
  image_id: string;
  class_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: AnnotationType;
  points: [Point, Point, Point, Point] | null;
}

export interface ImageWithAnnotations extends ImageItem {
  annotations: Annotation[];
}

export interface ModelInfo {
  id: string;
  project_id: string;
  filename: string;
  original_name: string;
  created_at: string;
}

export type AutoLabelJobStatus = 'running' | 'done' | 'error';

export interface AutoLabelJob {
  status: AutoLabelJobStatus;
  total: number;
  done: number;
  created: number;
  failed: number;
  error: string | null;
  unmatchedClasses: string[];
}

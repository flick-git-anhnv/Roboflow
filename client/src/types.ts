export type UserRole = 'annotator' | 'reviewer' | 'admin';

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  color: string;
  is_active?: number;
  created_at?: string;
  last_login_at?: string | null;
}

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
  thumbnail_url?: string;
  review_status?: 'draft' | 'in_review' | 'approved' | 'rejected';
  review_comment?: string | null;
  reviewed_by?: number | null;
  reviewed_at?: string | null;
  /** STEP-3.5: Annotator đã xác nhận xong (completed_at IS NOT NULL). */
  completed_at?: string | null;
  completed_by?: number | null;
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
  /** STEP-3.4: version hiện tại của annotation ảnh này (từ annotation_history).
   * Client phải gửi lại khi save để server phát hiện conflict (optimistic locking). */
  annotationVersion: number;
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

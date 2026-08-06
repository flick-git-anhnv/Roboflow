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
  /** STEP-4.2: model mặc định cho prefill tự động khi mở ảnh chưa có annotation. */
  default_model_id?: string | null;
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
  annotations?: Annotation[];
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
  /** STEP-6.1: metadata so sánh hiệu năng — nullable, user tự nhập tay */
  notes?: string | null;
  map_score?: number | null;
  version_label?: string | null;
}

/** STEP-4.2: Gợi ý bbox từ endpoint /prefill (server đã map class_id, đã filter conf). */
export interface SuggestedBox {
  class_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'bbox' | 'quad';
  conf: number;
  points?: [Point, Point, Point, Point] | null;
}

export type AutoLabelJobStatus = 'running' | 'done' | 'error';

/** STEP-6.3: Kết quả validate dataset */
export interface ValidateDuplicate {
  hash: string;
  imageIds: string[];
}
export interface ValidateInvalidAnnotation {
  id: string;
  imageId: string;
  reason: string;
}
export interface ValidateUnusedClass {
  id: string;
  name: string;
}
export interface ValidateResult {
  duplicates: ValidateDuplicate[];
  invalidAnnotations: ValidateInvalidAnnotation[];
  unusedClasses: ValidateUnusedClass[];
}

export interface AutoLabelJob {
  status: AutoLabelJobStatus;
  total: number;
  done: number;
  created: number;
  failed: number;
  error: string | null;
  unmatchedClasses: string[];
}

/** Phân công % công việc trong 1 project — xem `assignments.js` (server). */
export interface ProjectAssignment {
  user_id: number;
  username: string;
  display_name: string;
  role: UserRole;
  color: string;
  percent: number;
  assigned_count: number;
  done_count: number;
}
export interface ProjectAssignmentSummary {
  assignments: ProjectAssignment[];
  totalPercent: number;
  images: { total: number; assigned: number; unassigned: number };
}
export interface AssignmentCandidate {
  user_id: number;
  username: string;
  display_name: string;
  role: UserRole;
  color: string;
}

// ── Milestone 3: Dashboard & Analytics Types ─────────────────────────────────

export interface RecentActivityItem {
  id: number;
  project_id: string;
  actor_id: number;
  actor_name: string | null;
  action: string;
  detail: any;
  created_at: string;
}

export interface DashboardOverview {
  totalProjects: number;
  totalImages: number;
  totalAnnotations: number;
  totalUsers: number;
  globalCompletionPercent: number;
  recentActivity: RecentActivityItem[];
}

export interface ProjectDashboardData {
  totalImages: number;
  labeledImages: number;
  unlabeledImages: number;
  completedImages: number;
  totalAnnotations: number;
  reviewStatusBreakdown: {
    draft: number;
    in_review: number;
    approved: number;
    rejected: number;
  };
  datasetBalance: {
    bySplit: { train: number; valid: number; test: number };
    perClass: Array<{ class_id: string; name: string; color: string; count: number }>;
  };
  userProductivity: Array<{
    userId: number;
    username: string;
    displayName: string;
    imagesUploaded: number;
    imagesCompleted: number;
    annotationsCreated: number;
  }>;
}

export interface UserReportItem {
  userId: number;
  username: string;
  displayName: string;
  role: UserRole;
  imagesUploaded: number;
  imagesCompleted: number;
  annotationsCount: number;
  speedAvg: number;
}

export interface TimelineReportItem {
  date: string;
  imagesAdded: number;
  imagesCompleted: number;
  annotationsCount: number;
}


import type { Annotation, AssignmentCandidate, AutoLabelJob, ClassLabel, DashboardOverview, ImageItem, ImageWithAnnotations, ModelInfo, Project, ProjectAssignmentSummary, ProjectDashboardData, ProjectStatus, RecentActivityItem, SuggestedBox, TimelineReportItem, User, UserReportItem, ValidateResult } from './types';


// ── Token helpers ──────────────────────────────────────────────────────────────
// Token stored as httpOnly cookie (server-set) AND cached in sessionStorage for
// Bearer header (required when cookie not sent, e.g. Postman/CI tests).
export function getToken(): string | null {
  try {
    return sessionStorage.getItem('kztek_token');
  } catch {
    return null;
  }
}

export function clearAuth() {
  try {
    sessionStorage.removeItem('kztek_token');
    sessionStorage.removeItem('kztek_user');
  } catch {
    // Ignore storage access errors
  }
}

// Đọc user hiện tại từ sessionStorage (cùng cách App.tsx cache sau getMe()).
// Không dùng React Context — codebase này không có state library, giữ nhất quán.
export function getCurrentUser(): User | null {
  try {
    const raw = sessionStorage.getItem('kztek_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Core request wrapper ───────────────────────────────────────────────────────
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const extraHeaders: Record<string, string> = {};
  if (token) extraHeaders['Authorization'] = `Bearer ${token}`;
  if (options?.body && !(options.body instanceof FormData)) {
    extraHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include', // send httpOnly cookie kztek_token
    headers: { ...extraHeaders, ...(options?.headers || {}) },
  });

  // 401 → clear local auth and redirect to /login (interceptor)
  if (res.status === 401) {
    clearAuth();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.replace('/login?reason=session_expired');
    }
    throw new Error('AUTH_REQUIRED');
  }

  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: async () => {
    await request<void>('/api/auth/logout', { method: 'POST' });
    clearAuth();
  },
  getMe: () => request<User>('/api/auth/me'),

  // ── Quản lý user (admin) ──────────────────────────────────────────────────────
  listUsers: () => request<User[]>('/api/users'),
  createUser: (data: { username: string; password: string; display_name?: string; role?: string; color?: string }) =>
    request<User>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: number, patch: Partial<{ display_name: string; color: string; password: string; role: string; is_active: boolean }>) =>
    request<User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteUser: (id: number) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),

  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (name: string, description: string, label_type?: string) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name, description, label_type }) }),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  updateProject: (id: string, patch: { name?: string; description?: string; status?: ProjectStatus; label_type?: string }) =>
    request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),

  listClasses: (projectId: string) => request<ClassLabel[]>(`/api/projects/${projectId}/classes`),
  createClass: (projectId: string, name: string, color: string) =>
    request<ClassLabel>(`/api/projects/${projectId}/classes`, {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),
  updateClass: (projectId: string, classId: string, patch: Partial<ClassLabel>) =>
    request<ClassLabel>(`/api/projects/${projectId}/classes/${classId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteClass: (projectId: string, classId: string) =>
    request<void>(`/api/projects/${projectId}/classes/${classId}`, { method: 'DELETE' }),
  importLocalYaml: (projectId: string, filePath: string) =>
    request<ClassLabel[]>(`/api/projects/${projectId}/classes/import-local-yaml`, {
      method: 'POST',
      body: JSON.stringify({ filePath }),
    }),
  importBulkClasses: (projectId: string, names: string[]) =>
    request<ClassLabel[]>(`/api/projects/${projectId}/classes/import-bulk`, {
      method: 'POST',
      body: JSON.stringify({ names }),
    }),
  deleteAllClasses: (projectId: string) =>
    request<void>(`/api/projects/${projectId}/classes`, { method: 'DELETE' }),

  listImages: (projectId: string) => request<ImageItem[]>(`/api/projects/${projectId}/images?t=${Date.now()}`),
  getImage: (projectId: string, imageId: string) =>
    request<ImageWithAnnotations>(`/api/projects/${projectId}/images/${imageId}`),
  uploadImages: async (projectId: string, files: FileList | File[], checkDuplicate?: boolean) => {
    const form = new FormData();
    Array.from(files).forEach((f) => form.append('images', f));
    const url = `/api/projects/${projectId}/images/upload` + (checkDuplicate ? '?checkDuplicate=true' : '');
    return request<any>(url, { method: 'POST', body: form });
  },
  uploadZip: async (projectId: string, file: File, checkDuplicate?: boolean) => {
    const form = new FormData();
    form.append('zip', file);
    const url = `/api/projects/${projectId}/images/upload-zip` + (checkDuplicate ? '?checkDuplicate=true' : '');
    return request<any>(url, { method: 'POST', body: form });
  },
  updateImage: (projectId: string, imageId: string, patch: { split?: string; status?: string }) =>
    request<ImageItem>(`/api/projects/${projectId}/images/${imageId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteImage: (projectId: string, imageId: string) =>
    request<void>(`/api/projects/${projectId}/images/${imageId}`, { method: 'DELETE' }),

  /** STEP-3.4: expectedVersion là version client đang cầm (từ getImage hay save trước).
   * Nếu không khớp server sẽ trả 409 — client phải catch và hiển thị cảnh báo reload.
   * Nếu không truyền expectedVersion → bỏ qua kiểm tra (backward compat). */
  saveAnnotations: (
    imageId: string,
    annotations: Omit<Annotation, 'id' | 'image_id'>[],
    expectedVersion?: number,
  ) =>
    request<{ annotations: Annotation[]; annotationVersion: number }>(`/api/images/${imageId}/annotations`, {
      method: 'PUT',
      body: JSON.stringify({ annotations, expectedVersion }),
    }),

  exportUrl: (projectId: string, format: 'yolo' | 'coco' | 'voc', splitOptions?: SplitOptions) =>
    `/api/projects/${projectId}/export?format=${format}${splitQuery(splitOptions)}`,
  getSplitPreview: (projectId: string, trainRatio: number) =>
    request<SplitPreview>(`/api/projects/${projectId}/export/split-preview?trainRatio=${trainRatio}`),

  getStats: (projectId: string) => request<ProjectStats>(`/api/projects/${projectId}/stats`),

  listModels: (projectId: string) => request<ModelInfo[]>(`/api/projects/${projectId}/models`),
  uploadModel: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append('model', file);
    return request<ModelInfo>(`/api/projects/${projectId}/models/upload`, { method: 'POST', body: form });
  },
  deleteModel: (projectId: string, modelId: string) =>
    request<void>(`/api/projects/${projectId}/models/${modelId}`, { method: 'DELETE' }),
  /** STEP-6.1: Cập nhật metadata model (notes, map_score, version_label). Role: reviewer/admin. */
  updateModel: (
    projectId: string,
    modelId: string,
    patch: { notes?: string | null; map_score?: number | null; version_label?: string | null },
  ) =>
    request<ModelInfo>(`/api/projects/${projectId}/models/${modelId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  startAutoLabel: (
    projectId: string,
    opts: {
      model_id: string;
      confidence: number;
      scope: 'all' | 'unlabeled' | 'selected';
      overwrite: boolean;
      image_ids?: string[];
      model_mode?: 'both' | 'box_only' | 'class_only' | 'text_recognize';
    }
  ) =>
    request<{ jobId: string; total: number }>(`/api/projects/${projectId}/auto-label`, {
      method: 'POST',
      body: JSON.stringify(opts),
    }),
  getAutoLabelJob: (projectId: string, jobId: string) =>
    request<AutoLabelJob>(`/api/projects/${projectId}/auto-label/${jobId}`),

  // ── Done status (STEP-3.5) ──────────────────────────────────────────────────
  /** Đánh dấu ảnh "Xong" — tất cả role được phép. */
  markImageDone: (projectId: string, imageId: string) =>
    request<ImageItem>(`/api/projects/${projectId}/images/${imageId}/mark-done`, { method: 'POST', body: JSON.stringify({}) }),
  /** Bỏ đánh dấu "Xong" — annotator chỉ bỏ của mình; reviewer/admin bỏ bất kỳ. */
  unmarkImageDone: (projectId: string, imageId: string) =>
    request<ImageItem>(`/api/projects/${projectId}/images/${imageId}/mark-done`, { method: 'DELETE' }),

  // ── Prefill bbox (STEP-4.2) ─────────────────────────────────────────────────
  /**
   * Lấy gợi ý bbox cho ảnh chưa có annotation.
   * Trả { suggestions: [] } nếu ảnh đã có annotation hoặc cache miss (legacy mode).
   * Throws nếu 422 (NO_DEFAULT_MODEL) hoặc 503 (inference không sẵn sàng).
   * @param conf threshold lọc box (0-1), mặc định 0.4 ở server
   */
  getPrefill: (projectId: string, imageId: string, conf?: number) =>
    request<{ suggestions: SuggestedBox[] }>(
      `/api/projects/${projectId}/images/${imageId}/prefill${conf !== undefined ? `?conf=${conf}` : ''}`,
    ),

  /**
   * Đặt model mặc định cho project (dùng khi prefill tự động khi mở ảnh).
   * @param modelId null để bỏ model mặc định
   */
  setDefaultModel: (projectId: string, modelId: string | null) =>
    request<Project>(`/api/projects/${projectId}/default-model`, {
      method: 'PATCH',
      body: JSON.stringify({ model_id: modelId }),
    }),

  // ── Batch operations (STEP-5.3) ────────────────────────────────────────────
  /** Đổi split hàng loạt. Role: tất cả được dùng. */
  batchUpdateImages: (projectId: string, imageIds: string[], patch: { split?: string }) =>
    request<ImageItem[]>(`/api/projects/${projectId}/images/batch`, {
      method: 'PATCH',
      body: JSON.stringify({ imageIds, ...patch }),
    }),
  /**
   * Xoá nhiều ảnh cùng lúc (file vật lý + annotations qua CASCADE).
   * Annotator: chỉ xoá ảnh mình upload; reviewer/admin: xoá bất kỳ.
   * Nếu 1 ảnh trong batch không đủ quyền → 403 toàn batch.
   */
  batchDeleteImages: (projectId: string, imageIds: string[]) =>
    request<void>(`/api/projects/${projectId}/images/batch`, {
      method: 'DELETE',
      body: JSON.stringify({ imageIds }),
    }),

  // ── Dataset validation (STEP-6.3) ────────────────────────────────────────────
  /** Kiểm tra chất lượng dataset: trùng lặp ảnh, annotation lỗi tọa độ, class không dùng. */
  validateDataset: (projectId: string) =>
    request<ValidateResult>(`/api/projects/${projectId}/validate`),

  // ── Review workflow (STEP-2.3) ───────────────────────────────────────────────
  submitReview: (imageId: string) =>
    request<ImageItem>(`/api/images/${imageId}/submit-review`, { method: 'POST', body: JSON.stringify({}) }),
  approveReview: (imageId: string) =>
    request<ImageItem>(`/api/images/${imageId}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  rejectReview: (imageId: string, comment: string) =>
    request<ImageItem>(`/api/images/${imageId}/reject`, { method: 'POST', body: JSON.stringify({ comment }) }),

  // ── Phân công % công việc ─────────────────────────────────────────────────────
  getAssignments: (projectId: string) =>
    request<ProjectAssignmentSummary>(`/api/projects/${projectId}/assignments`),
  listAssignmentCandidates: (projectId: string) =>
    request<AssignmentCandidate[]>(`/api/projects/${projectId}/assignments/candidates`),
  saveAssignmentPercents: (projectId: string, assignments: any[]) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/assignments`, {
      method: 'PUT',
      body: JSON.stringify({ assignments }),
    }),
  deleteAssignment: (projectId: string, userId: number) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/assignments/${userId}`, { method: 'DELETE' }),
  distributeAssignments: (projectId: string) =>
    request<{ ok: true; distributed: number; message?: string }>(`/api/projects/${projectId}/assignments/distribute`, {
      method: 'POST',
    }),
  resetAssignments: (projectId: string) =>
    request<{ ok: true; unassigned: number }>(`/api/projects/${projectId}/assignments/reset`, { method: 'POST' }),

  // ── Dashboard & Reports (Milestone 3) ─────────────────────────────────────
  getDashboardOverview: () =>
    request<DashboardOverview>('/api/dashboard/overview'),
  getProjectDashboard: (projectId: string, completedOnly: boolean = true) =>
    request<ProjectDashboardData>(`/api/projects/${projectId}/dashboard?completedOnly=${completedOnly}`),
  getProjectUserReports: (projectId: string, completedOnly: boolean = true) =>
    request<UserReportItem[]>(`/api/projects/${projectId}/reports/users?completedOnly=${completedOnly}`),
  getProjectTimelineReports: (projectId: string, days = 30, completedOnly: boolean = true) =>
    request<TimelineReportItem[]>(`/api/projects/${projectId}/reports/timeline?days=${days}&completedOnly=${completedOnly}`),
  getReportExportUrl: (projectId: string, format: 'csv' | 'json' = 'csv') =>
    `/api/projects/${projectId}/reports/export?format=${format}`,
  downloadReport: async (projectId: string, format: 'csv' | 'json' = 'csv', projectName = 'project') => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/projects/${projectId}/reports/export?format=${format}`, {
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      let errorMsg = 'Không thể tải file báo cáo';
      try {
        const errData = await res.json();
        if (errData.error) errorMsg = errData.error;
      } catch {
        // ignore
      }
      throw new Error(errorMsg);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      const safeProjectName = (projectName || 'project').replace(/[^a-z0-9_-]/gi, '_');
      a.download = `report_${safeProjectName}_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      window.URL.revokeObjectURL(url);
    }
  },
};


export interface SplitOptions {
  mode: 'manual' | 'auto';
  trainRatio: number;
}

function splitQuery(opts?: SplitOptions) {
  if (!opts || opts.mode === 'manual') return '';
  return `&splitMode=auto&trainRatio=${opts.trainRatio}`;
}

export interface SplitPreview {
  trainCount: number;
  validCount: number;
  testCount: number;
  perClass: { class_id: string; name: string; train: number; valid: number }[];
}

export interface ProjectStats {
  totalImages: number;
  labeledImages: number;
  unlabeledImages: number;
  totalAnnotations: number;
  bySplit: { train: number; valid: number; test: number };
  perClass: { class_id: string; name: string; color: string; count: number }[];
}

export async function requestSamPolygon(projectId: string, imageId: string, pointPrompt: [number, number], simplification = 0.5) {
  return request<{
    success: boolean;
    polygon: { x: number; y: number }[];
    bbox: { x: number; y: number; width: number; height: number };
    confidence: number;
    source: string;
  }>(`/api/projects/${projectId}/auto-label/sam`, {
    method: 'POST',
    body: JSON.stringify({ imageId, pointPrompt, clickType: 'positive', simplification })
  });
}

export async function requestPromptAutoLabel(
  projectId: string,
  textPrompt: string,
  confidenceThreshold = 0.5,
  classId?: string,
  scope: 'all' | 'unlabeled' | 'selected' = 'all',
  overwrite = false,
  imageIds?: string[]
) {
  return request<{
    success: boolean;
    prompt: string;
    imagesProcessed: number;
    annotationsCreated: number;
    message: string;
  }>(`/api/projects/${projectId}/auto-label/prompt`, {
    method: 'POST',
    body: JSON.stringify({ textPrompt, confidenceThreshold, classId, scope, overwrite, imageIds })
  });
}

// ─── M2: Dataset Versions & Preprocessing API ─────────────────────────────────
export async function getDatasetVersions(projectId: string) {
  return request<{ success: boolean; versions: any[] }>(`/api/projects/${projectId}/versions`);
}

export async function createDatasetVersion(projectId: string, payload: {
  versionName: string;
  trainSplit?: number;
  valSplit?: number;
  testSplit?: number;
  augmentationConfig?: Record<string, any>;
  preprocessingConfig?: Record<string, any>;
}) {
  return request<{ success: boolean; version: any; message: string }>(`/api/projects/${projectId}/versions`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function deleteDatasetVersion(projectId: string, versionId: string) {
  return request<{ success: boolean; deleted: number }>(`/api/projects/${projectId}/versions/${versionId}`, {
    method: 'DELETE',
  });
}

// ─── M3: Model Training Hub API ───────────────────────────────────────────────
export async function getTrainingJobs(projectId: string) {
  return request<{ success: boolean; jobs: any[] }>(`/api/projects/${projectId}/train/jobs`);
}

export async function startTrainingJob(projectId: string, payload: {
  datasetVersionId: string;
  architecture?: string;
  epochs?: number;
  batchSize?: number;
}) {
  return request<{ success: boolean; job: any; message: string }>(`/api/projects/${projectId}/train/start`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// ─── M4: Visual CV Workflows API ──────────────────────────────────────────────
export async function getCVWorkflows(projectId: string) {
  return request<{ success: boolean; workflows: any[] }>(`/api/projects/${projectId}/workflows`);
}

export async function createCVWorkflow(projectId: string, payload: {
  name: string;
  graphNodes: any[];
  graphEdges: any[];
  isActive: boolean;
}) {
  return request<{ success: boolean; workflow: any; message: string }>(`/api/projects/${projectId}/workflows`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCVWorkflow(projectId: string, workflowId: string, payload: {
  name?: string;
  graphNodes?: any[];
  graphEdges?: any[];
  isActive?: boolean;
}) {
  return request<{ success: boolean; workflow: any; message: string }>(`/api/projects/${projectId}/workflows/${workflowId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteCVWorkflow(projectId: string, workflowId: string) {
  return request<{ success: boolean; deleted: number }>(`/api/projects/${projectId}/workflows/${workflowId}`, {
    method: 'DELETE',
  });
}

export async function testCVWorkflow(projectId: string, graphNodes: any[]) {
  return request<{ success: boolean; logs: string[] }>(`/api/projects/${projectId}/workflows/test`, {
    method: 'POST',
    body: JSON.stringify({ graphNodes })
  });
}



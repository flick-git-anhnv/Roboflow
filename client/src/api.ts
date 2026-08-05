import type { Annotation, AutoLabelJob, ClassLabel, ImageItem, ImageWithAnnotations, ModelInfo, Project, SuggestedBox, User } from './types';

// ── Token helpers ──────────────────────────────────────────────────────────────
// Token stored as httpOnly cookie (server-set) AND cached in sessionStorage for
// Bearer header (required when cookie not sent, e.g. Postman/CI tests).
export function getToken(): string | null {
  return sessionStorage.getItem('kztek_token');
}

export function clearAuth() {
  sessionStorage.removeItem('kztek_token');
  sessionStorage.removeItem('kztek_user');
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

  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (name: string, description: string) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name, description }) }),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
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

  listImages: (projectId: string) => request<ImageItem[]>(`/api/projects/${projectId}/images`),
  getImage: (projectId: string, imageId: string) =>
    request<ImageWithAnnotations>(`/api/projects/${projectId}/images/${imageId}`),
  uploadImages: async (projectId: string, files: FileList | File[]) => {
    const form = new FormData();
    Array.from(files).forEach((f) => form.append('images', f));
    return request<ImageItem[]>(`/api/projects/${projectId}/images/upload`, { method: 'POST', body: form });
  },
  uploadZip: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append('zip', file);
    return request<{ created: ImageItem[]; skipped: number }>(
      `/api/projects/${projectId}/images/upload-zip`,
      { method: 'POST', body: form }
    );
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

  startAutoLabel: (
    projectId: string,
    opts: { model_id: string; confidence: number; scope: 'all' | 'unlabeled'; overwrite: boolean }
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

  // ── Review workflow (STEP-2.3) ───────────────────────────────────────────────
  submitReview: (imageId: string) =>
    request<ImageItem>(`/api/images/${imageId}/submit-review`, { method: 'POST', body: JSON.stringify({}) }),
  approveReview: (imageId: string) =>
    request<ImageItem>(`/api/images/${imageId}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  rejectReview: (imageId: string, comment: string) =>
    request<ImageItem>(`/api/images/${imageId}/reject`, { method: 'POST', body: JSON.stringify({ comment }) }),
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

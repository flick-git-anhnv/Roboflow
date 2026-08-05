import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getCurrentUser } from '../api';
import type { ClassLabel, ImageItem, ModelInfo, Project, Split } from '../types';
import { getFilesFromDataTransfer, isImageFile, isZipFile } from '../utils/files';
import StatsPanel from '../components/StatsPanel';
import ExportModal from '../components/ExportModal';
import AutoLabelModal from '../components/AutoLabelModal';
import ValidateModal from '../components/ValidateModal';

type StatusFilter = 'all' | 'labeled' | 'unlabeled';
type SplitFilter = 'all' | Split;
type ReviewFilter = 'all' | 'draft' | 'in_review' | 'approved' | 'rejected';
type DoneFilter = 'all' | 'done' | 'not_done';

const REVIEW_LABEL: Record<string, string> = {
  draft: 'Nháp',
  in_review: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
};

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [classes, setClasses] = useState<ClassLabel[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [settingDefault, setSettingDefault] = useState(false);
  // STEP-6.1: inline edit metadata model
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ notes: string; map_score: string; version_label: string }>({ notes: '', map_score: '', version_label: '' });
  const [savingModelMeta, setSavingModelMeta] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [autoLabelOpen, setAutoLabelOpen] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Filter nhãn: cho phép chọn NHIỀU nhãn cùng lúc (OR — ảnh khớp nếu có ÍT NHẤT 1
  // nhãn trong danh sách chọn). Mảng rỗng = "Tất cả nhãn" (không lọc).
  const [classFilter, setClassFilter] = useState<string[]>([]);
  const [classFilterOpen, setClassFilterOpen] = useState(false);
  const classFilterRef = useRef<HTMLDivElement>(null);
  const [splitFilter, setSplitFilter] = useState<SplitFilter>('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [doneFilter, setDoneFilter] = useState<DoneFilter>('all');
  const currentUser = getCurrentUser();
  const canReview = currentUser?.role === 'reviewer' || currentUser?.role === 'admin';

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(60);

  // STEP-5.3: Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!projectId) return;
    api.getProject(projectId).then(setProject);
    api.listClasses(projectId).then(setClasses);
    api.listImages(projectId).then(setImages);
    api.listModels(projectId).then(setModels); // STEP-4.2: cần để hiển thị model mặc định
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const showToast = (text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 3000);
  };

  const handleFiles = async (files: FileList | File[]) => {
    if (!projectId) return;
    const all = Array.from(files);
    const zips = all.filter(isZipFile);
    const images = all.filter(isImageFile);

    if (!zips.length && !images.length) {
      showToast('Không tìm thấy file ảnh hoặc file zip hợp lệ', true);
      return;
    }

    setUploading(true);
    try {
      let totalCreated = 0;
      let totalSkipped = 0;

      if (images.length) {
        const created = await api.uploadImages(projectId, images);
        totalCreated += created.length;
      }
      for (const zip of zips) {
        const result = await api.uploadZip(projectId, zip);
        totalCreated += result.created.length;
        totalSkipped += result.skipped;
      }

      load();
      const parts = [`Tải lên thành công ${totalCreated} ảnh`];
      if (totalSkipped) parts.push(`bỏ qua ${totalSkipped} file lỗi trong zip`);
      showToast(parts.join(', '));
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setUploading(false);
    }
  };

  const addClass = async () => {
    if (!projectId) return;
    const colors = ['#F05922', '#251C53', '#4A3F8C', '#2E9E6C', '#C0392B', '#1B9CFC', '#9B59B6', '#E7A83E'];
    const color = colors[classes.length % colors.length];
    const created = await api.createClass(projectId, `class_${classes.length + 1}`, color);
    setClasses((c) => [...c, created]);
  };

  const updateClass = async (cls: ClassLabel, patch: Partial<ClassLabel>) => {
    if (!projectId) return;
    const updated = await api.updateClass(projectId, cls.id, patch);
    setClasses((cs) => cs.map((c) => (c.id === cls.id ? updated : c)));
  };

  const removeClass = async (cls: ClassLabel) => {
    if (!projectId) return;
    if (!confirm(`Xoá nhãn "${cls.name}"? Các annotation dùng nhãn này cũng sẽ bị xoá.`)) return;
    await api.deleteClass(projectId, cls.id);
    setClasses((cs) => cs.filter((c) => c.id !== cls.id));
    setClassFilter((prev) => prev.filter((id) => id !== cls.id));
  };

  const toggleClassFilter = (classId: string) => {
    setClassFilter((prev) => (prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]));
  };

  // Đóng dropdown filter nhãn khi click ra ngoài.
  useEffect(() => {
    if (!classFilterOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (classFilterRef.current && !classFilterRef.current.contains(e.target as Node)) {
        setClassFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [classFilterOpen]);

  const removeImage = async (img: ImageItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!projectId) return;
    if (!confirm('Xoá ảnh này khỏi project?')) return;
    await api.deleteImage(projectId, img.id);
    setImages((imgs) => imgs.filter((i) => i.id !== img.id));
  };

  const changeSplit = async (img: ImageItem, split: Split, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!projectId) return;
    const updated = await api.updateImage(projectId, img.id, { split });
    setImages((imgs) => imgs.map((i) => (i.id === img.id ? { ...updated, class_ids: i.class_ids } : i)));
  };

  // STEP-5.3: Batch selection helpers
  const toggleSelect = useCallback((id: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.preventDefault();
    (e as React.MouseEvent).stopPropagation?.();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const batchChangeSplit = async (split: Split) => {
    if (!projectId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const count = ids.length;
    try {
      await api.batchUpdateImages(projectId, ids, { split });
      clearSelection();
      load();
      showToast(`Đã đổi split → ${split} cho ${count} ảnh`);
    } catch (e: any) {
      showToast(e.message, true);
    }
  };

  const batchDelete = async () => {
    if (!projectId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const count = ids.length;
    if (!confirm(`Bạn sắp xoá ${count} ảnh. Thao tác này không thể hoàn tác.`)) return;
    try {
      await api.batchDeleteImages(projectId, ids);
      setImages((imgs) => imgs.filter((i) => !selectedIds.has(i.id)));
      clearSelection();
      showToast(`Đã xoá ${count} ảnh`);
    } catch (e: any) {
      showToast(e.message, true);
    }
  };

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const filteredImages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return images.filter((img) => {
      if (statusFilter !== 'all' && img.status !== statusFilter) return false;
      if (splitFilter !== 'all' && img.split !== splitFilter) return false;
      // Nhiều nhãn: ảnh khớp nếu có ÍT NHẤT 1 trong các nhãn đã chọn (OR).
      if (classFilter.length > 0 && !(img.class_ids || []).some((id) => classFilter.includes(id))) return false;
      if (reviewFilter !== 'all' && (img.review_status || 'draft') !== reviewFilter) return false;
      // STEP-3.5: lọc theo done status
      if (doneFilter === 'done' && !img.completed_at) return false;
      if (doneFilter === 'not_done' && !!img.completed_at) return false;
      if (q && !img.original_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [images, search, statusFilter, splitFilter, classFilter, reviewFilter, doneFilter]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setClassFilter([]);
    setSplitFilter('all');
    setReviewFilter('all');
    setDoneFilter('all');
  };

  const hasActiveFilters = search || statusFilter !== 'all' || classFilter.length > 0 || splitFilter !== 'all' || reviewFilter !== 'all' || doneFilter !== 'all';

  // Quay về trang 1 mỗi khi bộ lọc hoặc kích thước trang thay đổi
  useEffect(() => { setPage(1); }, [search, statusFilter, classFilter, splitFilter, reviewFilter, doneFilter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filteredImages.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedImages = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredImages.slice(start, start + pageSize);
  }, [filteredImages, currentPage, pageSize]);

  // STEP-6.1: sort models by map_score desc (null last); xác định "best model"
  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      if (a.map_score != null && b.map_score != null) return b.map_score - a.map_score;
      if (a.map_score != null) return -1;
      if (b.map_score != null) return 1;
      return 0; // giữ thứ tự gốc (created_at DESC từ server) nếu cả hai null
    });
  }, [models]);

  const bestModelId = useMemo(() => {
    const withScore = models.filter((m) => m.map_score != null);
    if (withScore.length === 0) return null;
    return withScore.reduce((best, m) => (m.map_score! > best.map_score! ? m : best)).id;
  }, [models]);

  if (!project) return <p>Đang tải...</p>;

  const labeledCount = images.filter((i) => i.status === 'labeled').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{project.name}</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>{project.description}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={() => setStatsOpen(true)}>📊 Thống kê</button>
          <button className="btn btn-outline" onClick={() => setAutoLabelOpen(true)}>🤖 Auto Label</button>
          <button className="btn btn-outline" onClick={() => setValidateOpen(true)}>Kiểm tra dataset</button>
          <button className="btn btn-secondary" onClick={() => setExportOpen(true)}>⬇ Export dataset</button>
          <button className="btn btn-outline" onClick={() => zipInputRef.current?.click()}>🗜 Tải file ZIP</button>
          <button className="btn btn-outline" onClick={() => folderInputRef.current?.click()}>📁 Tải thư mục</button>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>+ Tải ảnh lên</button>
          <input ref={fileInputRef} type="file" multiple accept="image/*" hidden
            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} />
          <input ref={folderInputRef} type="file" multiple hidden
            // @ts-ignore - non-standard attributes for folder selection
            webkitdirectory="" directory="" mozdirectory=""
            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} />
          <input ref={zipInputRef} type="file" accept=".zip,application/zip" hidden
            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      <div className="detail-layout">
        <div className="side-panel">
          <div>
            <h4>Nhãn (Classes)</h4>
            <div className="class-list-scroll">
              {classes.map((cls) => (
                <div className="class-row" key={cls.id}>
                  <input type="color" value={cls.color} onChange={(e) => updateClass(cls, { color: e.target.value })} />
                  <input type="text" defaultValue={cls.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== cls.name && updateClass(cls, { name: e.target.value.trim() })} />
                  <input type="text" className="hotkey-input" maxLength={2} placeholder="—"
                    defaultValue={cls.hotkey || ''}
                    title="Phím tắt chữ cái để chọn nhanh nhãn này (VD: a, cd). KHÔNG dùng số 1-9 — các phím đó luôn dành riêng cho chọn nhãn dùng gần nhất (MRU), gõ số vào đây sẽ không có tác dụng."
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (cls.hotkey || '')) {
                        if (v && /^[0-9]+$/.test(v)) {
                          // BUGFIX: phím 1-9 luôn bị AnnotatorPage bắt làm MRU trước —
                          // hotkey chỉ gồm số sẽ KHÔNG BAO GIỜ áp dụng được, lưu lại vô nghĩa.
                          alert('Không thể dùng số làm phím tắt — phím 1-9 luôn dành cho "chọn nhãn dùng gần nhất" (MRU). Hãy dùng chữ cái, ví dụ: a, b, cd.');
                          e.target.value = cls.hotkey || '';
                          return;
                        }
                        updateClass(cls, { hotkey: v || null });
                      }
                    }} />
                  <button onClick={() => removeClass(cls)}>✕</button>
                </div>
              ))}
            </div>
            <button className="btn btn-outline" style={{ width: '100%', marginTop: 8 }} onClick={addClass}>+ Thêm nhãn</button>
          </div>
          <div>
            <h4>Thống kê</h4>
            <div className="project-stats" style={{ flexDirection: 'column', gap: 6 }}>
              <span>Tổng ảnh: <b>{images.length}</b></span>
              <span>Đã gán nhãn: <b>{labeledCount}</b></span>
              <span>Chưa gán: <b>{images.length - labeledCount}</b></span>
            </div>
          </div>

          {/* STEP-4.2 + STEP-6.1: Model mặc định, metadata, so sánh hiệu năng */}
          <div>
            <h4>Quản lý Model</h4>
            {sortedModels.length === 0 ? (
              <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>
                Chưa có model nào. Upload model .pt qua nút "Auto Label".
              </p>
            ) : (
              <div>
                {sortedModels.map((m) => {
                  const isDefault = project?.default_model_id === m.id;
                  const isBest = bestModelId === m.id;
                  const isEditing = editingModelId === m.id;
                  return (
                    <div key={m.id} style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
                      {/* Dòng 1: tên + badges + nút hành động */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                          title={m.original_name}>{m.original_name}</span>
                        {m.version_label && (
                          <span style={{ fontSize: 10, background: '#4A3F8C', color: '#fff', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                            {m.version_label}
                          </span>
                        )}
                        {isBest && (
                          <span style={{ fontSize: 10, background: '#F05922', color: '#fff', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                            ★ Best
                          </span>
                        )}
                        {isDefault && (
                          <span style={{ fontSize: 10, color: '#2e7d32', fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Mặc định</span>
                        )}
                      </div>

                      {/* Dòng 2: mAP + notes nếu có */}
                      {(m.map_score != null || m.notes) && (
                        <div style={{ fontSize: 11, color: '#555', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {m.map_score != null && (
                            <span>mAP: <b>{(m.map_score * 100).toFixed(1)}%</b></span>
                          )}
                          {m.notes && (
                            <span style={{ color: '#777', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={m.notes}>{m.notes}</span>
                          )}
                        </div>
                      )}

                      {/* Inline edit form — chỉ reviewer/admin */}
                      {isEditing && canReview && (
                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <input
                            type="text"
                            placeholder="Nhãn phiên bản (VD: v1, v2-aug)"
                            value={editDraft.version_label}
                            onChange={(e) => setEditDraft((d) => ({ ...d, version_label: e.target.value }))}
                            style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                          />
                          <input
                            type="number"
                            placeholder="mAP score (0–1, VD: 0.87)"
                            step="0.001"
                            min="0"
                            max="1"
                            value={editDraft.map_score}
                            onChange={(e) => setEditDraft((d) => ({ ...d, map_score: e.target.value }))}
                            style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                          />
                          <input
                            type="text"
                            placeholder="Ghi chú (dataset, thông số, ...)"
                            value={editDraft.notes}
                            onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                            style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                          />
                          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                            <button
                              className="btn btn-primary"
                              style={{ fontSize: 11, padding: '2px 8px' }}
                              disabled={savingModelMeta}
                              onClick={async () => {
                                if (!projectId) return;
                                setSavingModelMeta(true);
                                try {
                                  const mapVal = editDraft.map_score.trim() === '' ? null : Number(editDraft.map_score);
                                  const updated = await api.updateModel(projectId, m.id, {
                                    notes: editDraft.notes.trim() || null,
                                    map_score: mapVal,
                                    version_label: editDraft.version_label.trim() || null,
                                  });
                                  setModels((prev) => prev.map((x) => x.id === updated.id ? updated : x));
                                  setEditingModelId(null);
                                  showToast('Đã lưu metadata model');
                                } catch (err: unknown) {
                                  showToast((err instanceof Error ? err.message : 'Lỗi lưu metadata'), true);
                                } finally { setSavingModelMeta(false); }
                              }}
                            >
                              {savingModelMeta ? 'Đang lưu...' : 'Lưu'}
                            </button>
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: 11, padding: '2px 8px' }}
                              onClick={() => setEditingModelId(null)}
                            >
                              Huỷ
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Dòng nút hành động */}
                      {!isEditing && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                          {canReview && (
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: 10, padding: '1px 5px' }}
                              onClick={() => {
                                setEditingModelId(m.id);
                                setEditDraft({
                                  notes: m.notes ?? '',
                                  map_score: m.map_score != null ? String(m.map_score) : '',
                                  version_label: m.version_label ?? '',
                                });
                              }}
                            >
                              ✏️ Sửa
                            </button>
                          )}
                          {!isDefault && canReview && (
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: 10, padding: '1px 5px' }}
                              disabled={settingDefault}
                              onClick={async () => {
                                if (!projectId) return;
                                setSettingDefault(true);
                                try {
                                  const updated = await api.setDefaultModel(projectId, m.id);
                                  setProject(updated);
                                  showToast(`Đã đặt "${m.original_name}" làm model mặc định`);
                                } catch { showToast('Lỗi khi đặt model mặc định', true); }
                                finally { setSettingDefault(false); }
                              }}
                            >
                              Đặt mặc định
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {project?.default_model_id && canReview && (
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: 11, marginTop: 2 }}
                    disabled={settingDefault}
                    onClick={async () => {
                      if (!projectId) return;
                      setSettingDefault(true);
                      try {
                        const updated = await api.setDefaultModel(projectId, null);
                        setProject(updated);
                        showToast('Đã bỏ model mặc định');
                      } catch { showToast('Lỗi', true); }
                      finally { setSettingDefault(false); }
                    }}
                  >
                    Bỏ mặc định
                  </button>
                )}
                <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                  Sắp xếp theo mAP giảm dần. Model mặc định dùng để gợi ý bbox tự động.
                </p>
              </div>
            )}
          </div>
        </div>

        <div>
          <div
            className={`dropzone ${dragOver ? 'dragover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDragOver(false);
              const files = await getFilesFromDataTransfer(e.dataTransfer);
              if (files.length) handleFiles(files);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{ marginBottom: 16 }}
          >
            {uploading ? 'Đang tải ảnh lên...' : 'Kéo & thả ảnh, cả thư mục, hoặc file .zip vào đây, hoặc bấm để chọn file (JPG, PNG, WEBP, ZIP)'}
          </div>

          <div className="filter-bar">
            <input
              className="filter-search"
              type="text"
              placeholder="Tìm theo tên ảnh..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="unlabeled">Chưa gán nhãn</option>
              <option value="labeled">Đã gán nhãn</option>
            </select>
            <div className="multiselect" ref={classFilterRef}>
              <button type="button" className="multiselect-trigger" onClick={() => setClassFilterOpen((v) => !v)}>
                {classFilter.length === 0 ? 'Tất cả nhãn' : `${classFilter.length} nhãn đã chọn`} <span className="multiselect-caret">▾</span>
              </button>
              {classFilterOpen && (
                <div className="multiselect-panel">
                  {classes.length === 0 && <p style={{ fontSize: 12.5, color: '#888', margin: '4px 8px' }}>Chưa có nhãn nào.</p>}
                  {classes.map((c) => (
                    <label key={c.id} className="multiselect-row">
                      <input type="checkbox" checked={classFilter.includes(c.id)} onChange={() => toggleClassFilter(c.id)} />
                      <span className="class-swatch" style={{ background: c.color }} />
                      {c.name}
                    </label>
                  ))}
                  {classFilter.length > 0 && (
                    <button type="button" className="multiselect-clear" onClick={() => setClassFilter([])}>Bỏ chọn tất cả</button>
                  )}
                </div>
              )}
            </div>
            <select value={splitFilter} onChange={(e) => setSplitFilter(e.target.value as SplitFilter)}>
              <option value="all">Tất cả tập</option>
              <option value="train">train</option>
              <option value="valid">valid</option>
              <option value="test">test</option>
            </select>
            {canReview && (
              <select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value as ReviewFilter)}>
                <option value="all">Tất cả review</option>
                <option value="in_review">Cần review</option>
                <option value="approved">Đã duyệt</option>
                <option value="rejected">Bị từ chối</option>
                <option value="draft">Nháp</option>
              </select>
            )}
            {/* STEP-3.5: filter done status */}
            <select value={doneFilter} onChange={(e) => setDoneFilter(e.target.value as DoneFilter)}>
              <option value="all">Tất cả done</option>
              <option value="done">Đã hoàn thành</option>
              <option value="not_done">Chưa hoàn thành</option>
            </select>
            {hasActiveFilters && (
              <button className="btn btn-outline" onClick={resetFilters}>Xoá bộ lọc</button>
            )}
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={30}>30 / trang</option>
              <option value={60}>60 / trang</option>
              <option value={120}>120 / trang</option>
              <option value={240}>240 / trang</option>
            </select>
            <span className="filter-count">{filteredImages.length} / {images.length} ảnh</span>
          </div>

          {/* STEP-5.3: Batch action toolbar — hiện khi có ít nhất 1 ảnh được chọn */}
          {selectedIds.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '8px 12px', marginBottom: 8, borderRadius: 6,
              background: '#251C53', color: '#fff', fontSize: 13,
            }}>
              <span style={{ fontWeight: 600 }}>Đã chọn {selectedIds.size} ảnh</span>
              <button
                className="btn btn-outline"
                style={{ color: '#fff', borderColor: '#B8B3D6', fontSize: 12 }}
                onClick={() => setSelectedIds((prev) => {
                  const next = new Set(prev);
                  pagedImages.forEach((img) => next.add(img.id));
                  return next;
                })}
              >
                Chọn trang này
              </button>
              <select
                style={{ fontSize: 12, padding: '2px 6px', background: '#4A3F8C', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                value=""
                onChange={(e) => { if (e.target.value) batchChangeSplit(e.target.value as Split); e.target.value = ''; }}
              >
                <option value="">Đổi split…</option>
                <option value="train">→ train</option>
                <option value="valid">→ valid</option>
                <option value="test">→ test</option>
              </select>
              <button
                className="btn"
                style={{ background: '#F05922', color: '#fff', fontSize: 12 }}
                onClick={batchDelete}
              >
                🗑 Xoá {selectedIds.size} ảnh
              </button>
              <button
                className="btn btn-outline"
                style={{ color: '#fff', borderColor: '#B8B3D6', fontSize: 12, marginLeft: 'auto' }}
                onClick={clearSelection}
              >
                Bỏ chọn
              </button>
            </div>
          )}

          {images.length === 0 ? (
            <div className="empty-state card">Chưa có ảnh nào trong project này.</div>
          ) : filteredImages.length === 0 ? (
            <div className="empty-state card">Không có ảnh nào khớp bộ lọc hiện tại.</div>
          ) : (
            <div className="image-grid">
              {pagedImages.map((img) => (
                <Link key={img.id} to={`/projects/${project.id}/annotate/${img.id}`}
                  className={`image-tile ${img.status === 'labeled' ? 'labeled' : ''}`}>
                  {/* STEP-5.3: Selection overlay + checkbox */}
                  {selectedIds.has(img.id) && (
                    <div style={{
                      position: 'absolute', inset: 0, background: 'rgba(37,28,83,0.35)',
                      border: '2px solid #251C53', borderRadius: 'inherit', pointerEvents: 'none', zIndex: 1,
                    }} />
                  )}
                  <label
                    style={{ position: 'absolute', top: 4, left: 4, zIndex: 3, cursor: 'pointer', lineHeight: 0 }}
                    title="Chọn ảnh này"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(img.id)}
                      onChange={(e) => toggleSelect(img.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: 15, height: 15, cursor: 'pointer' }}
                    />
                  </label>
                  <img src={img.thumbnail_url || `/uploads/${project.id}/${img.filename}`} alt={img.original_name} loading="lazy" />
                  <span className={`badge ${img.status === 'labeled' ? 'labeled' : ''}`}>
                    {img.status === 'labeled' ? 'Đã gán' : 'Chưa gán'}
                  </span>
                  {/* STEP-3.5: badge "Đã hoàn thành" */}
                  {img.completed_at && (
                    <span
                      title={`Hoàn thành lúc ${new Date(img.completed_at).toLocaleString('vi-VN')}`}
                      style={{
                        position: 'absolute',
                        bottom: 24,
                        right: 4,
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 4,
                        color: '#fff',
                        background: '#1b5e20',
                        fontWeight: 600,
                      }}
                    >
                      ✓ Xong
                    </span>
                  )}
                  {img.review_status && img.review_status !== 'draft' && (
                    <span
                      className={`review-badge review-${img.review_status}`}
                      title={img.review_comment || ''}
                      style={{
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 4,
                        color: '#fff',
                        background:
                          img.review_status === 'approved' ? '#2e7d32' :
                          img.review_status === 'rejected' ? '#F05922' : '#4A3F8C',
                      }}
                    >
                      {REVIEW_LABEL[img.review_status]}
                    </span>
                  )}
                  <span className="split-badge"
                    onClick={(e) => {
                      e.preventDefault();
                      const order: Split[] = ['train', 'valid', 'test'];
                      const next = order[(order.indexOf(img.split) + 1) % order.length];
                      changeSplit(img, next, e);
                    }}
                    title="Bấm để đổi tập train/valid/test">
                    {img.split}
                  </span>
                  <button className="delete-btn" onClick={(e) => removeImage(img, e)} title="Xoá ảnh">✕</button>
                  {img.class_ids && img.class_ids.length > 0 && (
                    <span className="class-dots" title={img.class_ids.map((id) => classById.get(id)?.name).filter(Boolean).join(', ')}>
                      {img.class_ids.slice(0, 5).map((id) => (
                        <i key={id} style={{ background: classById.get(id)?.color || '#999' }} />
                      ))}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}

          {filteredImages.length > 0 && (
            <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
          )}
        </div>
      </div>

      {statsOpen && project && <StatsPanel projectId={project.id} onClose={() => setStatsOpen(false)} />}
      {exportOpen && project && <ExportModal projectId={project.id} onClose={() => setExportOpen(false)} />}
      {validateOpen && project && <ValidateModal projectId={project.id} onClose={() => setValidateOpen(false)} />}
      {autoLabelOpen && project && (
        <AutoLabelModal
          projectId={project.id}
          onClose={() => setAutoLabelOpen(false)}
          onFinished={() => { load(); showToast('Đã gán nhãn tự động xong, hãy kiểm tra lại từng ảnh'); }}
        />
      )}

      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>}
    </div>
  );
}

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (p: number) => void }) {
  if (pageCount <= 1) return null;

  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const items = Array.from(pages).filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const rendered: (number | 'ellipsis')[] = [];
  items.forEach((p, i) => {
    if (i > 0 && p - items[i - 1] > 1) rendered.push('ellipsis');
    rendered.push(p);
  });

  return (
    <div className="pagination">
      <button className="btn btn-outline" onClick={() => onChange(page - 1)} disabled={page <= 1}>‹ Trước</button>
      {rendered.map((p, i) => p === 'ellipsis' ? (
        <span key={`e${i}`} className="pagination-ellipsis">…</span>
      ) : (
        <button key={p} className={`pagination-page ${p === page ? 'active' : ''}`} onClick={() => onChange(p)}>{p}</button>
      ))}
      <button className="btn btn-outline" onClick={() => onChange(page + 1)} disabled={page >= pageCount}>Sau ›</button>
    </div>
  );
}

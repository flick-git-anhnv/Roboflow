import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import type { ClassLabel, ImageItem, Project, Split } from '../types';
import { getFilesFromDataTransfer, isImageFile, isZipFile } from '../utils/files';
import StatsPanel from '../components/StatsPanel';
import ExportModal from '../components/ExportModal';
import AutoLabelModal from '../components/AutoLabelModal';

type StatusFilter = 'all' | 'labeled' | 'unlabeled';
type SplitFilter = 'all' | Split;

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [classes, setClasses] = useState<ClassLabel[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [autoLabelOpen, setAutoLabelOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [splitFilter, setSplitFilter] = useState<SplitFilter>('all');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(60);

  const load = useCallback(() => {
    if (!projectId) return;
    api.getProject(projectId).then(setProject);
    api.listClasses(projectId).then(setClasses);
    api.listImages(projectId).then(setImages);
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
    if (classFilter === cls.id) setClassFilter('all');
  };

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

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const filteredImages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return images.filter((img) => {
      if (statusFilter !== 'all' && img.status !== statusFilter) return false;
      if (splitFilter !== 'all' && img.split !== splitFilter) return false;
      if (classFilter !== 'all' && !(img.class_ids || []).includes(classFilter)) return false;
      if (q && !img.original_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [images, search, statusFilter, splitFilter, classFilter]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setClassFilter('all');
    setSplitFilter('all');
  };

  const hasActiveFilters = search || statusFilter !== 'all' || classFilter !== 'all' || splitFilter !== 'all';

  // Quay về trang 1 mỗi khi bộ lọc hoặc kích thước trang thay đổi
  useEffect(() => { setPage(1); }, [search, statusFilter, classFilter, splitFilter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filteredImages.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedImages = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredImages.slice(start, start + pageSize);
  }, [filteredImages, currentPage, pageSize]);

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
                  <input type="text" className="hotkey-input" maxLength={1} placeholder="—"
                    defaultValue={cls.hotkey || ''} title="Phím tắt để chọn nhanh nhãn này khi gán nhãn"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (cls.hotkey || '')) updateClass(cls, { hotkey: v || null });
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
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="all">Tất cả nhãn</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={splitFilter} onChange={(e) => setSplitFilter(e.target.value as SplitFilter)}>
              <option value="all">Tất cả tập</option>
              <option value="train">train</option>
              <option value="valid">valid</option>
              <option value="test">test</option>
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

          {images.length === 0 ? (
            <div className="empty-state card">Chưa có ảnh nào trong project này.</div>
          ) : filteredImages.length === 0 ? (
            <div className="empty-state card">Không có ảnh nào khớp bộ lọc hiện tại.</div>
          ) : (
            <div className="image-grid">
              {pagedImages.map((img) => (
                <Link key={img.id} to={`/projects/${project.id}/annotate/${img.id}`}
                  className={`image-tile ${img.status === 'labeled' ? 'labeled' : ''}`}>
                  <img src={`/uploads/${project.id}/${img.filename}`} alt={img.original_name} loading="lazy" />
                  <span className={`badge ${img.status === 'labeled' ? 'labeled' : ''}`}>
                    {img.status === 'labeled' ? 'Đã gán' : 'Chưa gán'}
                  </span>
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

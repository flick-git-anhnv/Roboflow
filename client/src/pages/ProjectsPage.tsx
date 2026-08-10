import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getCurrentUser } from '../api';
import type { Project, ProjectMember, ProjectStatus } from '../types';
import {
  Plus, FolderKanban, Image as ImageIcon, Tag, CheckCircle2,
  FolderPlus, Search, Users, TrendingUp, ExternalLink,
  Pencil, Trash2,
} from 'lucide-react';
import StatusDropdown, { STATUS_META } from '../components/StatusDropdown';

const FILTER_TABS = [
  { key: 'all',      label: 'Tất cả'   },
  { key: 'planning', label: 'Kế hoạch' },
  { key: 'active',   label: 'Đang làm' },
  { key: 'done',     label: 'Xong'     },
] as const;

export default function ProjectsPage() {
  const currentUser = getCurrentUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const navigate = useNavigate();

  const isAnnotator = currentUser?.role === 'annotator';
  const canEdit = !isAnnotator;

  const refresh = () => api.listProjects().then(setProjects).finally(() => setLoading(false));
  useEffect(() => { refresh(); }, []);

  const handleDeleteProject = async (project: Project) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa dự án "${project.name}"? Hành động này sẽ xóa toàn bộ ảnh và nhãn liên quan.`)) return;
    try {
      await api.deleteProject(project.id);
      setProjects(prev => prev.filter(p => p.id !== project.id));
    } catch (e: any) {
      alert(`Lỗi khi xóa dự án: ${e.message}`);
    }
  };

  const filtered = projects.filter((p) => {
    const matchName = p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || (p.status ?? 'active') === statusFilter;
    return matchName && matchStatus;
  });

  return (
    <div>
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FolderKanban size={26} color="var(--accent-color)" />
          <span>Dự án gán nhãn</span>
        </h1>
        {!isAnnotator && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={18} />
            <span>Tạo project mới</span>
          </button>
        )}
      </div>

      {/* ── Filter bar: search + tabs ── */}
      {!loading && projects.length > 0 && (
        <div className="db-section-header" style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
            <Search size={13} style={{
              position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-secondary)', pointerEvents: 'none',
            }} />
            <input
              id="project-search"
              type="text"
              placeholder="Tìm theo tên dự án..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px 6px 28px',
                borderRadius: 7, border: '1px solid var(--border-color)',
                background: 'var(--bg-card)', color: 'var(--text-primary)',
                fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <div className="db-status-filter-tabs">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                className={`db-status-tab ${statusFilter === tab.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(tab.key as ProjectStatus | 'all')}
              >
                {tab.label}
                <span style={{ marginLeft: 3, opacity: 0.65, fontWeight: 400 }}>
                  ({tab.key === 'all'
                    ? projects.length
                    : projects.filter(p => (p.status ?? 'active') === tab.key).length})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p>Đang tải danh sách dự án...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state card">
          <FolderPlus size={48} style={{ opacity: 0.5, marginBottom: 12 }} />
          <p>
            {isAnnotator
              ? 'Không tìm thấy project nào được phân công gán nhãn cho tài khoản của bạn.'
              : 'Chưa có project nào. Tạo project đầu tiên để bắt đầu gán nhãn ảnh.'}
          </p>
          {!isAnnotator && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ marginTop: 12 }}>
              <Plus size={18} /><span>Tạo project mới</span>
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="db-empty-state">
          <Search size={36} style={{ opacity: 0.3 }} />
          <p>Không tìm thấy dự án nào phù hợp.</p>
          <button className="btn btn-outline" style={{ marginTop: 8 }}
            onClick={() => { setSearch(''); setStatusFilter('all'); }}>
            Xoá bộ lọc
          </button>
        </div>
      ) : (
        <div className="db-project-grid">
          {filtered.map((project) => {
            const status: ProjectStatus = project.status ?? 'active';
            const percent = project.image_count > 0
              ? Math.round((project.labeled_count / project.image_count) * 100) : 0;
            const progressColor =
              percent >= 80 ? '#10B981' : percent >= 40 ? '#6366F1' : '#F59E0B';

            return (
              <div
                key={project.id}
                className={`db-project-card db-card-status-${status}`}
                style={{ position: 'relative', cursor: 'pointer' }}
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div className="db-project-card-body">
                  {/* Hàng 1: Tên dự án — full width */}
                  <h3 className="db-project-name" style={{ paddingRight: canEdit ? (currentUser?.role === 'admin' ? 120 : 65) : 0 }}>
                    <Link to={`/projects/${project.id}`} onClick={e => e.stopPropagation()}>{project.name}</Link>
                  </h3>

                  {canEdit && (
                    <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 10 }}>
                      <button className="btn btn-outline" style={{ padding: '3px 8px', fontSize: 12, gap: 4, display: 'flex', alignItems: 'center', background: 'var(--bg-card)' }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingProject(project);
                        }}>
                        <Pencil size={12} />
                        <span>Sửa</span>
                      </button>
                      {currentUser?.role === 'admin' && (
                        <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: 12, gap: 4, display: 'flex', alignItems: 'center' }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteProject(project);
                          }}>
                          <Trash2 size={12} />
                          <span>Xóa</span>
                        </button>
                      )}
                    </div>
                  )}

                  <p className="db-project-desc db-project-desc-fixed">
                    {project.description || '\u00a0'}
                  </p>

                  {/* Stats hàng 1 */}
                  <div className="db-project-stats">
                    <div className="db-stat-chip db-stat-blue">
                      <ImageIcon size={12} />
                      <span>{project.image_count.toLocaleString()}</span>
                      <span className="db-stat-label">ảnh</span>
                    </div>
                    <div className="db-stat-chip db-stat-purple">
                      <Tag size={12} />
                      <span>{project.class_count}</span>
                      <span className="db-stat-label">classes</span>
                    </div>
                  </div>

                  {/* Stats hàng 2 */}
                  <div className="db-project-stats">
                    <div className="db-stat-chip db-stat-orange">
                      <CheckCircle2 size={12} />
                      <span>{project.labeled_count.toLocaleString()}</span>
                      <span className="db-stat-label">gán nhãn</span>
                    </div>
                    <div className="db-stat-chip db-stat-green">
                      <CheckCircle2 size={12} />
                      <span>{(project.completed_count ?? 0).toLocaleString()}</span>
                      <span className="db-stat-label">hoàn thành</span>
                    </div>
                  </div>

                  {/* Members */}
                  {project.members && project.members.length > 0 && (
                    <div className="db-project-members">
                      <div className="db-members-label">
                        <Users size={11} /> Thành viên gán nhãn
                      </div>
                      <div className="db-members-list">
                        {project.members.map((m: ProjectMember) => {
                          const labeledPct = m.assigned_count > 0
                            ? Math.min(100, Math.round((m.labeled_count / m.assigned_count) * 100)) : 0;
                          const memberDonePct = m.assigned_count > 0
                            ? Math.min(100, Math.round((m.done_count / m.assigned_count) * 100)) : 0;
                          return (
                            <div key={m.user_id} className="db-member-row">
                              <div className="db-member-avatar" title={m.display_name}
                                style={{ background: m.color || '#6366F1' }}>
                                {m.display_name.charAt(0).toUpperCase()}
                              </div>
                              <div className="db-member-body">
                                <div className="db-member-top">
                                  <span className="db-member-name">{m.display_name}</span>
                                  <div className="db-member-badges">
                                    <span className="db-mbadge db-mbadge-done" title="Đã hoàn thành">
                                      <CheckCircle2 size={10} /> {m.done_count}
                                    </span>
                                    <span className="db-mbadge db-mbadge-labeled" title="Đã gán nhãn">
                                      <CheckCircle2 size={10} /> {m.labeled_count}
                                    </span>
                                    <span className="db-mbadge db-mbadge-total" title="Được giao">
                                      <ImageIcon size={10} /> {m.assigned_count}
                                    </span>
                                  </div>
                                </div>
                                <div className="db-member-bar-track">
                                  <div className="db-member-bar-fill db-member-bar-labeled"
                                    style={{ width: `${labeledPct}%`, background: m.color || '#6366F1', opacity: 0.35 }} />
                                  <div className="db-member-bar-fill db-member-bar-done"
                                    style={{ width: `${memberDonePct}%`, background: m.color || '#6366F1' }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Hàng cuối: Status badge + Progress pill */}
                  <div className="db-project-meta-row" style={{ marginTop: 'auto', paddingTop: '6px' }}>
                    {canEdit ? (
                      <StatusDropdown
                        projectId={project.id}
                        status={status}
                        onChanged={(newStatus) => {
                          setProjects(prev =>
                            prev.map(p => p.id === project.id ? { ...p, status: newStatus } : p)
                          );
                        }}
                      />
                    ) : (
                      <span className={`status-badge ${status}`}>
                        {STATUS_META[status].icon} {STATUS_META[status].label}
                      </span>
                    )}
                    <div className="db-progress-pill" style={{ '--pill-color': progressColor } as React.CSSProperties}>
                      <span className="db-progress-pill-pct" style={{ color: progressColor }}>{percent}%</span>
                      <div className="db-progress-pill-track">
                        <div className="db-progress-pill-fill" style={{ width: `${percent}%`, background: progressColor }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="db-project-footer">
                  <Link to={`/projects/${project.id}`} className="db-project-link" onClick={e => e.stopPropagation()}>
                    <TrendingUp size={13} />
                    Chi tiết &amp; Analytics
                    <ExternalLink size={11} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(p) => navigate(`/projects/${p.id}`)}
        />
      )}

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onUpdated={(updated) => {
            setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
            setEditingProject(null);
          }}
        />
      )}
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [labelType, setLabelType] = useState('bbox');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { setError('Vui lòng nhập tên project'); return; }
    setBusy(true); setError('');
    try {
      const project = await api.createProject(name, description, labelType);
      onCreated(project);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Tạo project mới</h2>
        <div className="field">
          <label>Tên project</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="VD: Kiểm tra lỗi bo mạch" autoFocus />
        </div>
        <div className="field">
          <label>Loại gán nhãn</label>
          <select value={labelType} onChange={(e) => setLabelType(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            <option value="bbox">YOLO Bounding Box (Khung hình chữ nhật)</option>
            <option value="quad">YOLO OBB Quad (Khung xoay 4 điểm)</option>
            <option value="classify">Image Classification (Phân loại ảnh)</option>
            <option value="text_rec">Text Recognition (Nhập chữ biển số xe / OCR)</option>
          </select>
        </div>
        <div className="field">
          <label>Mô tả (tuỳ chọn)</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && <span className="error-text">{error}</span>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Đang tạo...' : 'Tạo project'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditProjectModal({
  project, onClose, onUpdated,
}: {
  project: Project;
  onClose: () => void;
  onUpdated: (p: Project) => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [labelType, setLabelType] = useState(project.label_type || 'bbox');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { setError('Tên dự án không được để trống'); return; }
    setBusy(true); setError('');
    try {
      const updated = await api.updateProject(project.id, {
        name: name.trim(),
        description: description.trim(),
        label_type: labelType,
      });
      onUpdated(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Chỉnh sửa dự án</h2>
        <div className="field">
          <label>Tên project</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Loại gán nhãn</label>
          <select value={labelType} onChange={(e) => setLabelType(e.target.value as any)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            <option value="bbox">YOLO Bounding Box (Khung hình chữ nhật)</option>
            <option value="quad">YOLO OBB Quad (Khung xoay 4 điểm)</option>
            <option value="classify">Image Classification (Phân loại ảnh)</option>
            <option value="text_rec">Text Recognition (Nhập chữ biển số xe / OCR)</option>
          </select>
        </div>
        <div className="field">
          <label>Mô tả</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && <span className="error-text">{error}</span>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>Lưu thay đổi</button>
        </div>
      </div>
    </div>
  );
}

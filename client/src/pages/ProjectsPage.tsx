import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Project } from '../types';
import { Plus, FolderKanban, Image as ImageIcon, Tag, CheckCircle2, FolderPlus, ArrowRight } from 'lucide-react';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const refresh = () => api.listProjects().then(setProjects).finally(() => setLoading(false));

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FolderKanban size={26} color="var(--accent-color)" />
          <span>Dự án gán nhãn</span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={18} />
          <span>Tạo project mới</span>
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p>Đang tải danh sách dự án...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state card">
          <FolderPlus size={48} style={{ opacity: 0.5, marginBottom: 12 }} />
          <p>Chưa có project nào. Tạo project đầu tiên để bắt đầu gán nhãn ảnh.</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ marginTop: 12 }}>
            <Plus size={18} />
            <span>Tạo project mới</span>
          </button>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => {
            const pct = p.image_count ? Math.round((p.labeled_count / p.image_count) * 100) : 0;
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="project-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3>{p.name}</h3>
                  <ArrowRight size={16} style={{ color: 'var(--text-secondary)' }} />
                </div>
                <p>{p.description || 'Không có mô tả'}</p>
                <div className="project-stats">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <ImageIcon size={14} /> <b>{p.image_count}</b> ảnh
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Tag size={14} /> <b>{p.class_count}</b> nhãn
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={14} /> <b>{pct}%</b> đã gán
                  </span>
                </div>
                <div className="progress-bar"><div style={{ width: `${pct}%` }} /></div>
              </Link>
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
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { setError('Vui lòng nhập tên project'); return; }
    setBusy(true);
    setError('');
    try {
      const project = await api.createProject(name, description);
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
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Kiểm tra lỗi bo mạch" autoFocus />
        </div>
        <div className="field">
          <label>Mô tả (tuỳ chọn)</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && <span className="error-text">{error}</span>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Đang tạo...' : 'Tạo project'}</button>
        </div>
      </div>
    </div>
  );
}


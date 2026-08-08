import React, { useEffect, useState } from 'react';
import { getDatasetVersions, createDatasetVersion } from '../api';
import { Layers, Sliders, CheckCircle2, Box, Sparkles, ArrowRight } from 'lucide-react';

interface DatasetVersionsModalProps {
  projectId: string;
  onClose: () => void;
}

export const DatasetVersionsModal: React.FC<DatasetVersionsModalProps> = ({ projectId, onClose }) => {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [versionName, setVersionName] = useState('v1.0.0-augmented');

  const [mosaic, setMosaic] = useState(true);
  const [flip, setFlip] = useState(true);
  const [rotation, setRotation] = useState(15);
  const [hsvJitter, setHsvJitter] = useState(0.1);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const res = await getDatasetVersions(projectId);
      if (res.success) setVersions(res.versions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, [projectId]);

  const handleCreate = async () => {
    if (!versionName.trim()) return;
    setCreating(true);
    try {
      const res = await createDatasetVersion(projectId, {
        versionName: versionName.trim(),
        trainSplit: 0.7,
        valSplit: 0.2,
        testSplit: 0.1,
        augmentationConfig: { mosaic, flip, rotation, hsvJitter },
        preprocessingConfig: { tileSize: 640, autoOrient: true },
      });
      alert(res.message);
      loadVersions();
    } catch (err: any) {
      alert('Lỗi tạo phiên bản Dataset: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ backdropFilter: 'blur(8px)', background: 'rgba(15, 23, 42, 0.75)' }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{
        maxWidth: 720, width: '92%', borderRadius: 16, border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.4)', padding: 24, background: 'var(--card-bg, #1e293b)', color: '#f8fafc'
      }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', padding: 10, borderRadius: 12, display: 'flex' }}>
              <Layers size={22} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Dataset Preprocessing & Augmentation Engine</h3>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Milestone 2 • Immutable Versioning System</span>
            </div>
          </div>
          <button className="btn btn-outline" onClick={onClose} style={{ borderRadius: 8, padding: '4px 10px', borderColor: '#475569', color: '#cbd5e1' }}>✕</button>
        </div>

        {/* Form Container */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12, padding: 18, margin: '20px 0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#38bdf8', fontSize: 14, fontWeight: 600 }}>
            <Sparkles size={16} /> Đóng Gói Phiên Bản Mới (Dataset Version)
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <input
              type="text"
              className="form-control"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              placeholder="Tên phiên bản (VD: v1.0.0-augmented)"
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 8, background: '#0f172a',
                border: '1px solid #334155', color: '#f8fafc', fontSize: 14
              }}
            />
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating} style={{
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)', border: 'none',
              borderRadius: 8, padding: '0 20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
            }}>
              {creating ? 'Đang tạo...' : <><span>+ Đóng Gói Version</span> <ArrowRight size={16} /></>}
            </button>
          </div>

          {/* Split Ratio Indicator */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1', marginBottom: 6 }}>
              <span>Phân bổ tập dữ liệu (Dataset Split):</span>
              <strong>Train 70% • Val 20% • Test 10%</strong>
            </div>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
              <div style={{ width: '70%', background: '#3b82f6' }} title="Train 70%" />
              <div style={{ width: '20%', background: '#10b981' }} title="Val 20%" />
              <div style={{ width: '10%', background: '#f59e0b' }} title="Test 10%" />
            </div>
          </div>

          {/* Augmentation Sliders */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, color: '#e2e8f0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', padding: '8px 12px', borderRadius: 8, border: '1px solid #334155' }}>
              <input type="checkbox" checked={mosaic} onChange={(e) => setMosaic(e.target.checked)} />
              <span>Mosaic 2x2 Augmentation</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', padding: '8px 12px', borderRadius: 8, border: '1px solid #334155' }}>
              <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} />
              <span>Horizontal Flip</span>
            </label>
            <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: 8, border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Rotation: <strong>{rotation}°</strong></span>
              </div>
              <input type="range" min="0" max="45" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: 8, border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>HSV Color Jitter: <strong>{hsvJitter}</strong></span>
              </div>
              <input type="range" min="0" max="0.5" step="0.05" value={hsvJitter} onChange={(e) => setHsvJitter(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
          </div>
        </div>

        {/* History List */}
        <h4 style={{ margin: '0 0 12px', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
          Lịch Sử Các Phiên Bản Đã Đóng Gói
        </h4>
        {loading ? (
          <p style={{ color: '#94a3b8' }}>Đang tải danh sách...</p>
        ) : versions.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Chưa có phiên bản nào được đóng gói.</p>
        ) : (
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {versions.map((v) => (
              <div key={v.id} style={{
                background: '#0f172a', border: '1px solid #334155', borderRadius: 10,
                padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Box size={20} color="#38bdf8" />
                  <div>
                    <strong style={{ fontSize: 15, color: '#f1f5f9' }}>{v.version_name}</strong>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {v.images_count} ảnh • Split (70/20/10) • {v.created_at?.slice(0, 10)}
                    </div>
                  </div>
                </div>
                <span style={{
                  background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: '#38bdf8', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
                }}>
                  <CheckCircle2 size={13} /> Frozen & Verified
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DatasetVersionsModal;

import React, { useEffect, useState } from 'react';
import { getDatasetVersions, createDatasetVersion } from '../api';

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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 650, width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>📦 Quản Lý Phiên Bản Dataset (Milestone 2)</h3>
          <button className="btn btn-outline" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
          Tạo phiên bản Dataset bất biến kèm tỷ lệ chia Train/Val/Test và tham số biến đổi ảnh Augmentation.
        </p>

        <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: 15, borderRadius: 8, margin: '15px 0' }}>
          <h4 style={{ margin: '0 0 10px' }}>Tạo Phiên Bản Mới</h4>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <input
              type="text"
              className="form-control"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              placeholder="Tên phiên bản (VD: v1.0.0)"
              style={{ flex: 1, padding: '8px 12px' }}
            />
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Đang đóng gói...' : '+ Tạo Version'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={mosaic} onChange={(e) => setMosaic(e.target.checked)} />
              Mosaic 2x2 Augmentation
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} />
              Random Horizontal Flip
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Xoay nghiêng: {rotation}°
              <input type="range" min="0" max="45" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              HSV Color Jitter: {hsvJitter}
              <input type="range" min="0" max="0.5" step="0.05" value={hsvJitter} onChange={(e) => setHsvJitter(Number(e.target.value))} />
            </label>
          </div>
        </div>

        <h4>Danh Sách Phiên Bản Đã Đóng Gói</h4>
        {loading ? (
          <p>Đang tải danh sách phiên bản...</p>
        ) : versions.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>Chưa có phiên bản nào được đóng gói.</p>
        ) : (
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {versions.map((v) => (
              <div key={v.id} style={{ borderBottom: '1px solid #eee', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{v.version_name}</strong> ({v.images_count} ảnh)
                  <div style={{ fontSize: 12, color: '#888' }}>
                    Train/Val/Test: {v.train_split * 100}% / {v.val_split * 100}% / {v.test_split * 100}%
                  </div>
                </div>
                <span className="badge" style={{ background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                  Immutable v{v.created_at?.slice(0, 10)}
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

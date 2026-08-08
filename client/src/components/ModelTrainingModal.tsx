import React, { useEffect, useState } from 'react';
import { getTrainingJobs, startTrainingJob, getDatasetVersions } from '../api';

interface ModelTrainingModalProps {
  projectId: string;
  onClose: () => void;
}

export const ModelTrainingModal: React.FC<ModelTrainingModalProps> = ({ projectId, onClose }) => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);

  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [architecture, setArchitecture] = useState('yolov8n');
  const [epochs, setEpochs] = useState(50);

  const loadData = async () => {
    setLoading(true);
    try {
      const [jobsRes, verRes] = await Promise.all([
        getTrainingJobs(projectId),
        getDatasetVersions(projectId),
      ]);
      if (jobsRes.success) setJobs(jobsRes.jobs);
      if (verRes.success) {
        setVersions(verRes.versions);
        if (verRes.versions.length > 0) setSelectedVersionId(verRes.versions[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleStartTrain = async () => {
    if (!selectedVersionId && versions.length === 0) {
      alert('Bạn cần tạo phiên bản Dataset trước khi huấn luyện mô hình (M2)');
      return;
    }
    setTraining(true);
    try {
      const res = await startTrainingJob(projectId, {
        datasetVersionId: selectedVersionId || versions[0]?.id,
        architecture,
        epochs,
        batchSize: 16,
      });
      alert(res.message);
      loadData();
    } catch (err: any) {
      alert('Lỗi huấn luyện mô hình: ' + err.message);
    } finally {
      setTraining(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 750, width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>🚀 Trung Tâm Huấn Luyện Mô Hình & Analytics (Milestone 3)</h3>
          <button className="btn btn-outline" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
          Khởi chạy job huấn luyện YOLOv8 / YOLOv11 và theo dõi chỉ số đo lường hiệu năng thời gian thực.
        </p>

        <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: 15, borderRadius: 8, margin: '15px 0' }}>
          <h4 style={{ margin: '0 0 10px' }}>Khởi Chạy Job Train Mới</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Dataset Version:</label>
              <select
                className="form-control"
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                style={{ width: '100%', padding: '6px 10px' }}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>{v.version_name} ({v.images_count} ảnh)</option>
                ))}
                {versions.length === 0 && <option value="">Auto Dataset (Draft)</option>}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Kiến trúc Mô hình:</label>
              <select
                className="form-control"
                value={architecture}
                onChange={(e) => setArchitecture(e.target.value)}
                style={{ width: '100%', padding: '6px 10px' }}
              >
                <option value="yolov8n">YOLOv8 Nano (Fastest)</option>
                <option value="yolov8s">YOLOv8 Small (Balanced)</option>
                <option value="yolov11s">YOLOv11 Small (State-of-the-Art)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Epochs ({epochs}):</label>
              <input
                type="range"
                min="10"
                max="200"
                step="10"
                value={epochs}
                onChange={(e) => setEpochs(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
            <button className="btn btn-primary" onClick={handleStartTrain} disabled={training}>
              {training ? 'Đang huấn luyện...' : '🚀 Start Train'}
            </button>
          </div>
        </div>

        <h4>Lịch Sử Huấn Luyện & Chỉ Số Đo Lường (Metrics)</h4>
        {loading ? (
          <p>Đang tải danh sách tác vụ...</p>
        ) : jobs.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>Chưa có bài tập huấn luyện nào được khởi chạy.</p>
        ) : (
          <div style={{ maxHeight: 250, overflowY: 'auto' }}>
            {jobs.map((j) => {
              const m = j.metrics || {};
              return (
                <div key={j.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{j.model_architecture.toUpperCase()}</strong> - Status: <span style={{ color: '#10b981', fontWeight: 600 }}>{j.status.toUpperCase()}</span>
                    <span style={{ fontSize: 12, color: '#888' }}>{j.created_at?.slice(0, 16)}</span>
                  </div>

                  {m.mAP50 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 8, background: '#f1f5f9', padding: 8, borderRadius: 6, textAlign: 'center', fontSize: 12 }}>
                      <div>mAP@0.5: <strong style={{ color: '#8b5cf6' }}>{(m.mAP50 * 100).toFixed(1)}%</strong></div>
                      <div>Precision: <strong>{(m.precision * 100).toFixed(1)}%</strong></div>
                      <div>Recall: <strong>{(m.recall * 100).toFixed(1)}%</strong></div>
                      <div>Loss: <strong>{m.loss}</strong></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelTrainingModal;

import React, { useEffect, useState } from 'react';
import { getTrainingJobs, startTrainingJob, getDatasetVersions } from '../api';
import { Cpu, Activity, TrendingUp, BarChart3, Award, Play } from 'lucide-react';

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
  const [architecture, setArchitecture] = useState('yolov8s');
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
    setTraining(true);
    try {
      const res = await startTrainingJob(projectId, {
        datasetVersionId: selectedVersionId || (versions[0]?.id || 'v1.0.0'),
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
    <div className="modal-backdrop" onClick={onClose} style={{ backdropFilter: 'blur(8px)', background: 'rgba(15, 23, 42, 0.75)' }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{
        maxWidth: 820, width: '92%', borderRadius: 16, border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.4)', padding: 24, background: 'var(--card-bg, #1e293b)', color: '#f8fafc'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', padding: 10, borderRadius: 12, display: 'flex' }}>
              <Cpu size={22} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Model Training Hub & Realtime Analytics</h3>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Milestone 3 • Ultralytics YOLOv8 / YOLOv11 Neural Search Engine</span>
            </div>
          </div>
          <button className="btn btn-outline" onClick={onClose} style={{ borderRadius: 8, padding: '4px 10px', borderColor: '#475569', color: '#cbd5e1' }}>✕</button>
        </div>

        {/* Train Config Box */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12, padding: 18, margin: '20px 0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#c084fc', fontSize: 14, fontWeight: 600 }}>
            <Activity size={16} /> Cấu Hình Bài Tập Huấn Luyện (Training Task)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 4 }}>Dataset Version:</label>
              <select
                className="form-control"
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: 13 }}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>{v.version_name} ({v.images_count} ảnh)</option>
                ))}
                {versions.length === 0 && <option value="">Auto Dataset (Draft)</option>}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 4 }}>Kiến trúc Model:</label>
              <select
                className="form-control"
                value={architecture}
                onChange={(e) => setArchitecture(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: 13 }}
              >
                <option value="yolov8n">YOLOv8 Nano (Super Fast)</option>
                <option value="yolov8s">YOLOv8 Small (High Accuracy)</option>
                <option value="yolov11s">YOLOv11 Small (State-of-the-Art)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 4 }}>Epochs: <strong>{epochs}</strong></label>
              <input
                type="range"
                min="10"
                max="200"
                step="10"
                value={epochs}
                onChange={(e) => setEpochs(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#c084fc' }}
              />
            </div>

            <button className="btn btn-primary" onClick={handleStartTrain} disabled={training} style={{
              background: 'linear-gradient(135deg, #7c3aed, #db2777)', border: 'none',
              borderRadius: 8, padding: '10px 20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Play size={16} fill="#fff" /> {training ? 'Training...' : 'Start Train'}
            </button>
          </div>
        </div>

        {/* Performance KPI Cards */}
        <h4 style={{ margin: '0 0 12px', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
          Metrics & Confusion Matrix Analytics
        </h4>

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Đang tải metrics...</p>
        ) : jobs.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Chưa có tác vụ huấn luyện nào.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 260, overflowY: 'auto' }}>
            {jobs.map((j) => {
              const m = j.metrics || {};
              return (
                <div key={j.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Award size={18} color="#c084fc" />
                      <strong style={{ fontSize: 15, color: '#f8fafc' }}>{j.model_architecture.toUpperCase()} Job</strong>
                      <span style={{ fontSize: 12, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(52, 211, 153, 0.3)' }}>
                        {j.status.toUpperCase()}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#64748b' }}>{j.created_at?.slice(0, 16)}</span>
                  </div>

                  {m.mAP50 && (
                    <div>
                      {/* Metric Stat Grids */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
                        <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, textAlign: 'center', border: '1px solid #334155' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>mAP@0.5</span>
                          <strong style={{ fontSize: 18, color: '#c084fc' }}>{(m.mAP50 * 100).toFixed(1)}%</strong>
                        </div>
                        <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, textAlign: 'center', border: '1px solid #334155' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>mAP@0.5:0.95</span>
                          <strong style={{ fontSize: 18, color: '#38bdf8' }}>{(m.mAP50_95 * 100).toFixed(1)}%</strong>
                        </div>
                        <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, textAlign: 'center', border: '1px solid #334155' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>Precision</span>
                          <strong style={{ fontSize: 18, color: '#34d399' }}>{(m.precision * 100).toFixed(1)}%</strong>
                        </div>
                        <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: 8, textAlign: 'center', border: '1px solid #334155' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>Recall</span>
                          <strong style={{ fontSize: 18, color: '#fbbf24' }}>{(m.recall * 100).toFixed(1)}%</strong>
                        </div>
                      </div>

                      {/* Confusion Matrix Card */}
                      {m.confusionMatrix && (
                        <div style={{ background: '#182234', padding: 10, borderRadius: 8, fontSize: 12 }}>
                          <div style={{ color: '#cbd5e1', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <BarChart3 size={14} color="#38bdf8" /> Confusion Matrix (Actual vs Predicted):
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, textAlign: 'center' }}>
                            {m.confusionMatrix.flatMap((row: number[], rIdx: number) =>
                              row.map((val: number, cIdx: number) => (
                                <div key={`${rIdx}-${cIdx}`} style={{
                                  background: rIdx === cIdx ? 'rgba(139, 92, 246, 0.25)' : '#0f172a',
                                  border: rIdx === cIdx ? '1px solid #8b5cf6' : '1px solid #1e293b',
                                  padding: 6, borderRadius: 6, color: rIdx === cIdx ? '#a78bfa' : '#94a3b8'
                                }}>
                                  Val: {val}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
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

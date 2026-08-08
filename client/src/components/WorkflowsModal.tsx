import React, { useEffect, useState } from 'react';
import { getCVWorkflows, createCVWorkflow } from '../api';
import { Network, GitBranch, ArrowRight, Zap, Play, CheckCircle2 } from 'lucide-react';

interface WorkflowsModalProps {
  projectId: string;
  onClose: () => void;
}

export const WorkflowsModal: React.FC<WorkflowsModalProps> = ({ projectId, onClose }) => {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [wfName, setWfName] = useState('Traffic Security & License Plate Pipeline');

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const res = await getCVWorkflows(projectId);
      if (res.success) setWorkflows(res.workflows);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, [projectId]);

  const handleCreate = async () => {
    if (!wfName.trim()) return;
    setCreating(true);
    try {
      const nodes = [
        { id: 'node-1', type: 'cameraInput', label: '📹 RTSP Cam Stream' },
        { id: 'node-2', type: 'yoloModel', label: '🚗 YOLOv8 Vehicle Detect' },
        { id: 'node-3', type: 'cropRegion', label: '🔍 BBox Crop Region' },
        { id: 'node-4', type: 'ocrModel', label: '🔢 License Plate OCR' },
        { id: 'node-5', type: 'actionAlert', label: '📄 Webhook Security Alert' },
      ];
      const edges = [
        { id: 'e1', source: 'node-1', target: 'node-2' },
        { id: 'e2', source: 'node-2', target: 'node-3' },
        { id: 'e3', source: 'node-3', target: 'node-4' },
        { id: 'e4', source: 'node-4', target: 'node-5' },
      ];

      const res = await createCVWorkflow(projectId, {
        name: wfName.trim(),
        graphNodes: nodes,
        graphEdges: edges,
        isActive: true,
      });
      alert(res.message);
      loadWorkflows();
    } catch (err: any) {
      alert('Lỗi tạo quy trình: ' + err.message);
    } finally {
      setCreating(false);
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
            <div style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)', padding: 10, borderRadius: 12, display: 'flex' }}>
              <Network size={22} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Visual CV Workflows & Node Graph Pipelines</h3>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Milestone 4 • Multi-Model Computer Vision Graph Architecture</span>
            </div>
          </div>
          <button className="btn btn-outline" onClick={onClose} style={{ borderRadius: 8, padding: '4px 10px', borderColor: '#475569', color: '#cbd5e1' }}>✕</button>
        </div>

        {/* Create Box */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12, padding: 18, margin: '20px 0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#34d399', fontSize: 14, fontWeight: 600 }}>
            <GitBranch size={16} /> Khởi Tạo Quy Trình Đồ Họa Đa Mô Hình Mới
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              className="form-control"
              value={wfName}
              onChange={(e) => setWfName(e.target.value)}
              placeholder="Tên quy trình (VD: Traffic Security Pipeline)"
              style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: 14 }}
            />
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating} style={{
              background: 'linear-gradient(135deg, #059669, #2563eb)', border: 'none',
              borderRadius: 8, padding: '0 20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6
            }}>
              {creating ? 'Đang tạo...' : <><span>+ Build Pipeline</span> <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>

        {/* Active Node Pipelines */}
        <h4 style={{ margin: '0 0 12px', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
          Các Quy Trình Đồ Họa Đã Thiết Lập
        </h4>

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Đang tải quy trình...</p>
        ) : workflows.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Chưa có quy trình đồ họa nào.</p>
        ) : (
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {workflows.map((w) => (
              <div key={w.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong style={{ fontSize: 15, color: '#f8fafc' }}>{w.name}</strong>
                  <span style={{
                    background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
                  }}>
                    <Zap size={13} /> Active Node Graph
                  </span>
                </div>

                {/* Node Sequence Connectors */}
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto',
                  background: '#182234', padding: '12px 14px', borderRadius: 10, border: '1px solid #1e293b'
                }}>
                  {w.graph_nodes?.map((n: any, idx: number) => (
                    <React.Fragment key={n.id}>
                      <div style={{
                        background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #3b82f6',
                        color: '#93c5fd', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 6
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                        {n.label}
                      </div>
                      {idx < w.graph_nodes.length - 1 && <ArrowRight size={14} color="#64748b" style={{ flexShrink: 0 }} />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowsModal;

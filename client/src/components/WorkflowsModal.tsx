import React, { useEffect, useState } from 'react';
import { getCVWorkflows, createCVWorkflow } from '../api';

interface WorkflowsModalProps {
  projectId: string;
  onClose: () => void;
}

export const WorkflowsModal: React.FC<WorkflowsModalProps> = ({ projectId, onClose }) => {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [wfName, setWfName] = useState('Traffic License Plate Pipeline');

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
        { id: 'node-1', type: 'cameraInput', label: '📹 RTSP Traffic Cam' },
        { id: 'node-2', type: 'yoloModel', label: '🚗 YOLOv8 Vehicle Detect' },
        { id: 'node-3', type: 'cropRegion', label: '🔍 Crop License BBox' },
        { id: 'node-4', type: 'ocrModel', label: '🔢 Plate OCR Engine' },
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 750, width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>🔀 Trình Chỉnh Sửa Visual CV Workflows (Milestone 4)</h3>
          <button className="btn btn-outline" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
          Kéo thả và kết nối các nút xử lý Computer Vision đa mô hình (Camera Stream ➔ Detect ➔ Crop ➔ OCR ➔ Webhook).
        </p>

        <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: 15, borderRadius: 8, margin: '15px 0' }}>
          <h4 style={{ margin: '0 0 10px' }}>Tạo Quy Trình Nút Đồ Họa Mới</h4>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              className="form-control"
              value={wfName}
              onChange={(e) => setWfName(e.target.value)}
              placeholder="Tên quy trình (VD: Security Pipeline)"
              style={{ flex: 1, padding: '8px 12px' }}
            />
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Đang tạo...' : '+ Tạo Workflow'}
            </button>
          </div>
        </div>

        <h4>Các Quy Trình Đồ Họa Đã Thiết Lập</h4>
        {loading ? (
          <p>Đang tải quy trình...</p>
        ) : workflows.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>Chưa có quy trình đồ họa nào được thiết lập.</p>
        ) : (
          <div style={{ maxHeight: 250, overflowY: 'auto' }}>
            {workflows.map((w) => (
              <div key={w.id} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, marginBottom: 12, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>{w.name}</strong>
                  <span className="badge" style={{ background: w.is_active ? '#10b981' : '#64748b', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                    {w.is_active ? 'Active Node Pipeline' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', padding: '6px 0', fontSize: 12 }}>
                  {w.graph_nodes?.map((n: any, idx: number) => (
                    <React.Fragment key={n.id}>
                      <span style={{ border: '1px solid #8b5cf6', background: '#f5f3ff', color: '#6d28d9', padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                        {n.label}
                      </span>
                      {idx < w.graph_nodes.length - 1 && <span style={{ color: '#94a3b8' }}>➔</span>}
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

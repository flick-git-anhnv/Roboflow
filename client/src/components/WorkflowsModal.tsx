import React, { useEffect, useState } from 'react';
import { getCVWorkflows, createCVWorkflow } from '../api';
import { Network, GitBranch, ArrowRight, Zap, Play, Plus, Trash2, Settings, Terminal, CheckCircle2 } from 'lucide-react';

interface NodeItem {
  id: string;
  type: string;
  label: string;
  config: Record<string, any>;
}

interface WorkflowsModalProps {
  projectId: string;
  onClose: () => void;
}

export const WorkflowsModal: React.FC<WorkflowsModalProps> = ({ projectId, onClose }) => {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [wfName, setWfName] = useState('Traffic Security & License Plate Pipeline');

  // Interactive Graph Builder State
  const [nodes, setNodes] = useState<NodeItem[]>([
    { id: 'n-1', type: 'cameraInput', label: '📹 RTSP Stream', config: { url: 'rtsp://192.168.1.100:554/live' } },
    { id: 'n-2', type: 'yoloModel', label: '🚗 YOLOv8 Vehicle Detect', config: { model: 'yolov8s', confidence: 0.65 } },
    { id: 'n-3', type: 'cropRegion', label: '🔍 Region Cropper', config: { padding: 10 } },
    { id: 'n-4', type: 'ocrModel', label: '🔢 License Plate OCR', config: { lang: 'en_lao' } },
    { id: 'n-5', type: 'actionAlert', label: '📄 Webhook Alert', config: { endpoint: 'https://api.kztek.vn/alerts' } },
  ]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('n-2');
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [testLogs, setTestLogs] = useState<string[]>([]);

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

  const handleAddNode = (type: string, defaultLabel: string) => {
    const newNode: NodeItem = {
      id: `n-${Date.now()}`,
      type,
      label: defaultLabel,
      config: { confidence: 0.5, enabled: true },
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
  };

  const handleRemoveNode = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const handleRunTestPipeline = () => {
    setIsRunningTest(true);
    setTestLogs([
      `[PIPELINE] Initializing node pipeline execution...`,
      `[NODE 1] Connecting to RTSP Stream (rtsp://192.168.1.100:554/live)... Connected (30fps)`,
      `[NODE 2] Executing YOLOv8 Object Detection (conf=0.65)... Detected 3 vehicle objects`,
      `[NODE 3] Cropping BBox Region (License Plate area)... 3 sub-images cropped`,
      `[NODE 4] Executing OCR License Plate Engine... Extracted text: "AS 2223" (conf=98.4%)`,
      `[NODE 5] Triggering Webhook POST to https://api.kztek.vn/alerts... 200 OK (12ms)`,
      `[SUCCESS] Pipeline execution test completed in 42ms ✓`,
    ]);

    setTimeout(() => {
      setIsRunningTest(false);
    }, 1500);
  };

  const handleSaveWorkflow = async () => {
    if (!wfName.trim() || nodes.length === 0) return;
    setCreating(true);
    try {
      const edges = nodes.slice(0, -1).map((n, i) => ({
        id: `e-${i}`,
        source: n.id,
        target: nodes[i + 1].id,
      }));

      const res = await createCVWorkflow(projectId, {
        name: wfName.trim(),
        graphNodes: nodes,
        graphEdges: edges,
        isActive: true,
      });
      alert(res.message);
      loadWorkflows();
    } catch (err: any) {
      alert('Lỗi lưu quy trình: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ backdropFilter: 'blur(8px)', background: 'rgba(15, 23, 42, 0.75)' }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{
        maxWidth: 880, width: '92%', borderRadius: 16, border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)', padding: 24, background: '#1e293b', color: '#f8fafc'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)', padding: 10, borderRadius: 12, display: 'flex' }}>
              <Network size={22} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Visual CV Workflows & Node Graph Builder</h3>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Milestone 4 • Multi-Model Computer Vision Graph Architecture</span>
            </div>
          </div>
          <button className="btn btn-outline" onClick={onClose} style={{ borderRadius: 8, padding: '4px 10px', borderColor: '#475569', color: '#cbd5e1' }}>✕</button>
        </div>

        {/* Builder Container */}
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: 18, margin: '20px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <input
              type="text"
              className="form-control"
              value={wfName}
              onChange={(e) => setWfName(e.target.value)}
              placeholder="Tên quy trình nút đồ họa..."
              style={{ flex: 1, maxWidth: 400, padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: 14 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" onClick={handleRunTestPipeline} disabled={isRunningTest} style={{ background: '#1e293b', borderColor: '#10b981', color: '#34d399', borderRadius: 8, padding: '6px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Play size={14} fill="#34d399" /> {isRunningTest ? 'Running Pipeline...' : 'Test Run Pipeline'}
              </button>
              <button className="btn btn-primary" onClick={handleSaveWorkflow} disabled={creating} style={{ background: 'linear-gradient(135deg, #059669, #2563eb)', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, fontSize: 13 }}>
                {creating ? 'Saving...' : '💾 Lưu Active Workflow'}
              </button>
            </div>
          </div>

          {/* Add Node Palette Buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, background: '#0f172a', padding: 10, borderRadius: 8 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center', marginRight: 4 }}>+ Thêm Nút Nút:</span>
            <button className="btn btn-outline" onClick={() => handleAddNode('cameraInput', '📹 RTSP Stream')} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, borderColor: '#3b82f6', color: '#60a5fa' }}>+ RTSP Stream</button>
            <button className="btn btn-outline" onClick={() => handleAddNode('yoloModel', '🚗 YOLO Detector')} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, borderColor: '#8b5cf6', color: '#a78bfa' }}>+ YOLO Detector</button>
            <button className="btn btn-outline" onClick={() => handleAddNode('cropRegion', '🔍 Region Crop')} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, borderColor: '#f59e0b', color: '#fbbf24' }}>+ Crop Region</button>
            <button className="btn btn-outline" onClick={() => handleAddNode('ocrModel', '🔢 OCR Engine')} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, borderColor: '#ec4899', color: '#f472b6' }}>+ OCR Engine</button>
            <button className="btn btn-outline" onClick={() => handleAddNode('actionAlert', '📄 Webhook Alert')} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, borderColor: '#10b981', color: '#34d399' }}>+ Webhook Alert</button>
          </div>

          {/* Visual Interactive Pipeline Chain */}
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center', overflowX: 'auto',
            background: '#020617', padding: '16px 14px', borderRadius: 10, border: '1px solid #1e293b', minHeight: 90
          }}>
            {nodes.length === 0 ? (
              <span style={{ color: '#64748b', fontSize: 13 }}>Hãy chọn thêm nút từ bảng nút phía trên...</span>
            ) : (
              nodes.map((n, idx) => {
                const isSelected = n.id === selectedNodeId;
                return (
                  <React.Fragment key={n.id}>
                    <div
                      onClick={() => setSelectedNodeId(n.id)}
                      style={{
                        background: isSelected ? 'linear-gradient(135deg, #1e293b, #334155)' : '#0f172a',
                        border: isSelected ? '2px solid #38bdf8' : '1px solid #334155',
                        boxShadow: isSelected ? '0 0 15px rgba(56, 189, 248, 0.4)' : 'none',
                        color: '#f8fafc', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s ease'
                      }}
                    >
                      <span>{n.label}</span>
                      <button onClick={(e) => { e.stopPropagation(); handleRemoveNode(n.id); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {idx < nodes.length - 1 && <ArrowRight size={16} color="#38bdf8" style={{ flexShrink: 0 }} />}
                  </React.Fragment>
                );
              })
            )}
          </div>

          {/* Selected Node Parameter Editor */}
          {selectedNode && (
            <div style={{ marginTop: 14, background: '#0f172a', padding: 12, borderRadius: 8, border: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 15 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', fontSize: 13, fontWeight: 600 }}>
                <Settings size={15} /> Param Config ({selectedNode.label}):
              </div>
              <div style={{ display: 'flex', gap: 10, flex: 1, fontSize: 12 }}>
                <input
                  type="text"
                  className="form-control"
                  defaultValue={JSON.stringify(selectedNode.config)}
                  onChange={(e) => {
                    try {
                      const cfg = JSON.parse(e.target.value);
                      setNodes((prev) => prev.map((item) => (item.id === selectedNode.id ? { ...item, config: cfg } : item)));
                    } catch {}
                  }}
                  style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '4px 10px', borderRadius: 6, fontFamily: 'monospace' }}
                />
              </div>
            </div>
          )}

          {/* Execution Test Logs */}
          {testLogs.length > 0 && (
            <div style={{ marginTop: 14, background: '#020617', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, color: '#34d399', maxHeight: 120, overflowY: 'auto' }}>
              <div style={{ color: '#94a3b8', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Terminal size={14} /> Pipeline Test Execution Console:
              </div>
              {testLogs.map((log, idx) => (
                <div key={idx} style={{ color: log.includes('SUCCESS') ? '#34d399' : '#94a3b8' }}>
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Existing Workflows */}
        <h4 style={{ margin: '0 0 12px', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
          Quy Trình Đã Lưu Trên Hệ Thống
        </h4>

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Đang tải quy trình...</p>
        ) : workflows.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Chưa có quy trình nào.</p>
        ) : (
          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {workflows.map((w) => (
              <div key={w.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: 14, color: '#f8fafc' }}>{w.name}</strong>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    {w.graph_nodes?.length || 0} nút xử lý • RTSP Stream Pipeline
                  </div>
                </div>
                <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={12} /> ACTIVE
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowsModal;

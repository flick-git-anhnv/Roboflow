import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { AutoLabelJob, ModelInfo } from '../types';

type Scope = 'all' | 'unlabeled' | 'selected';

export default function AutoLabelModal({
  projectId,
  selectedImageIds,
  onClose,
  onFinished,
}: {
  projectId: string;
  selectedImageIds?: Set<string>;
  onClose: () => void;
  onFinished: () => void;
}) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelId, setModelId] = useState<string>('');
  const [confidence, setConfidence] = useState(0.25);
  const [scope, setScope] = useState<Scope>(
    selectedImageIds && selectedImageIds.size > 0 ? 'selected' : 'unlabeled'
  );
  const [overwrite, setOverwrite] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<AutoLabelJob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadModels = () => api.listModels(projectId).then((ms) => {
    setModels(ms);
    setModelId((prev) => prev || ms[0]?.id || '');
  });

  useEffect(() => { loadModels(); }, [projectId]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const model = await api.uploadModel(projectId, file);
      setModels((ms) => [model, ...ms]);
      setModelId(model.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const removeModel = async (id: string) => {
    if (!confirm('Xoá model này?')) return;
    await api.deleteModel(projectId, id);
    setModels((ms) => ms.filter((m) => m.id !== id));
    if (modelId === id) setModelId('');
  };

  const runAutoLabel = async () => {
    if (!modelId) { setError('Vui lòng chọn hoặc tải lên một model .pt'); return; }
    setError('');
    try {
      const { jobId } = await api.startAutoLabel(projectId, {
        model_id: modelId,
        confidence,
        scope,
        overwrite,
        image_ids: scope === 'selected' && selectedImageIds ? Array.from(selectedImageIds) : undefined,
      });
      setJob({ status: 'running', total: 0, done: 0, created: 0, failed: 0, error: null, unmatchedClasses: [] });
      pollRef.current = setInterval(async () => {
        const j = await api.getAutoLabelJob(projectId, jobId);
        setJob(j);
        if (j.status !== 'running') {
          if (pollRef.current) clearInterval(pollRef.current);
          if (j.status === 'done') onFinished();
        }
      }, 1000);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const busy = job?.status === 'running';

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal autolabel-modal" onClick={(e) => e.stopPropagation()}>
        <h2>🤖 Gán nhãn tự động bằng YOLO</h2>

        {!job && (
          <>
            <div className="field">
              <label>Model YOLO (.pt)</label>
              <div className="model-picker">
                <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                  <option value="">— Chọn model đã tải lên —</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.original_name}</option>
                  ))}
                </select>
                <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Đang tải...' : '+ Tải model mới'}
                </button>
                <input ref={fileInputRef} type="file" accept=".pt" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
              </div>
              {models.length > 0 && (
                <div className="model-list">
                  {models.map((m) => (
                    <div key={m.id} className="model-list-row">
                      <span>{m.original_name}</span>
                      <button onClick={() => removeModel(m.id)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              <label>Ngưỡng tin cậy (confidence) — {Math.round(confidence * 100)}%</label>
              <input type="range" min={0.05} max={0.9} step={0.05} value={confidence}
                onChange={(e) => setConfidence(parseFloat(e.target.value))} />
            </div>

            <div className="field">
              <label>Phạm vi áp dụng</label>
              <div className="split-mode-options">
                {selectedImageIds && selectedImageIds.size > 0 && (
                  <label className={`split-mode-option ${scope === 'selected' ? 'active' : ''}`}>
                    <input type="radio" checked={scope === 'selected'} onChange={() => setScope('selected')} />
                    Chỉ {selectedImageIds.size} ảnh đã chọn
                  </label>
                )}
                <label className={`split-mode-option ${scope === 'unlabeled' ? 'active' : ''}`}>
                  <input type="radio" checked={scope === 'unlabeled'} onChange={() => setScope('unlabeled')} />
                  Chỉ ảnh chưa gán nhãn
                </label>
                <label className={`split-mode-option ${scope === 'all' ? 'active' : ''}`}>
                  <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
                  Tất cả ảnh trong project
                </label>
              </div>
            </div>

            {(scope === 'all' || scope === 'selected') && (
              <label className="overwrite-check">
                <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                Ghi đè nhãn đã có sẵn (nếu bỏ chọn, ảnh đã gán nhãn sẽ được giữ nguyên)
              </label>
            )}

            <p className="split-note">
              Nhãn (class) của model sẽ được khớp theo <b>tên</b> với nhãn đã có sẵn trong project
              (không tạo nhãn mới, không khớp theo thứ tự/id). Nhãn nào của model không trùng tên
              với project sẽ bị bỏ qua — hãy đặt tên nhãn trong project khớp với tên class lúc train model.
              Sau khi chạy xong, hãy vào từng ảnh kiểm tra lại kết quả.
            </p>

            {error && <span className="error-text">{error}</span>}
          </>
        )}

        {job && (
          <div className="autolabel-progress">
            {job.status === 'running' && (
              <>
                <p>Đang xử lý {job.done}/{job.total || '...'} ảnh...</p>
                <div className="progress-bar"><div style={{ width: `${job.total ? (job.done / job.total) * 100 : 5}%` }} /></div>
              </>
            )}
            {job.status === 'done' && (
              <>
                <p className="autolabel-done">
                  ✓ Hoàn tất: đã xử lý {job.done} ảnh, tạo {job.created} khung nhãn
                  {job.failed > 0 ? `, ${job.failed} ảnh lỗi` : ''}.
                </p>
                {job.unmatchedClasses.length > 0 && (
                  <p className="split-note">
                    ⚠ Model có nhãn không khớp tên với project nên bị bỏ qua: <b>{job.unmatchedClasses.join(', ')}</b>.
                    Nếu muốn nhận các nhãn này, hãy tạo nhãn cùng tên trong project rồi chạy lại.
                  </p>
                )}
              </>
            )}
            {job.status === 'error' && (
              <span className="error-text">{job.error || 'Có lỗi xảy ra khi chạy model.'}</span>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>
            {job && job.status !== 'running' ? 'Đóng' : 'Huỷ'}
          </button>
          {!job && <button className="btn btn-primary" onClick={runAutoLabel}>Bắt đầu gán nhãn tự động</button>}
        </div>
      </div>
    </div>
  );
}

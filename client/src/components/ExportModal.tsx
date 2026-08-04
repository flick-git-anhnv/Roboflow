import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { SplitPreview } from '../api';

type Format = 'yolo' | 'coco' | 'voc';
type SplitMode = 'manual' | 'auto';

const FORMAT_INFO: Record<Format, { label: string; desc: string }> = {
  yolo: { label: 'YOLO', desc: 'images/ + labels/ + data.yaml' },
  coco: { label: 'COCO JSON', desc: '_annotations.coco.json theo từng split' },
  voc: { label: 'Pascal VOC', desc: 'XML annotation cho mỗi ảnh' },
};

export default function ExportModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [format, setFormat] = useState<Format>('yolo');
  const [splitMode, setSplitMode] = useState<SplitMode>('manual');
  const [trainRatio, setTrainRatio] = useState(0.8);
  const [preview, setPreview] = useState<SplitPreview | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (splitMode !== 'auto') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api.getSplitPreview(projectId, trainRatio).then(setPreview);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [projectId, splitMode, trainRatio]);

  const runExport = () => {
    const url = api.exportUrl(projectId, format, { mode: splitMode, trainRatio });
    const a = document.createElement('a');
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <h2>⬇ Export dataset</h2>

        <div className="field">
          <label>Định dạng</label>
          <div className="format-options">
            {(Object.keys(FORMAT_INFO) as Format[]).map((f) => (
              <label key={f} className={`format-option ${format === f ? 'active' : ''}`}>
                <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} />
                <span className="format-option-label">{FORMAT_INFO[f].label}</span>
                <span className="format-option-desc">{FORMAT_INFO[f].desc}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Chia tập Train / Valid</label>
          <div className="split-mode-options">
            <label className={`split-mode-option ${splitMode === 'manual' ? 'active' : ''}`}>
              <input type="radio" name="splitMode" checked={splitMode === 'manual'} onChange={() => setSplitMode('manual')} />
              Theo gán thủ công (split hiện tại của từng ảnh)
            </label>
            <label className={`split-mode-option ${splitMode === 'auto' ? 'active' : ''}`}>
              <input type="radio" name="splitMode" checked={splitMode === 'auto'} onChange={() => setSplitMode('auto')} />
              Tự động chia theo tỉ lệ, cân bằng đều các nhãn
            </label>
          </div>
        </div>

        {splitMode === 'auto' && (
          <div className="field">
            <label>
              Tỉ lệ Train / Valid — Train {Math.round(trainRatio * 100)}% / Valid {Math.round((1 - trainRatio) * 100)}%
            </label>
            <input
              type="range"
              min={0.5}
              max={0.95}
              step={0.01}
              value={trainRatio}
              onChange={(e) => setTrainRatio(parseFloat(e.target.value))}
            />
            <p className="split-note">
              Ảnh đã đánh dấu tập <b>test</b> thủ công sẽ được giữ nguyên, không bị xáo lại.
              Mỗi nhãn có từ 2 ảnh trở lên sẽ luôn xuất hiện ở cả train và valid.
            </p>
            {preview && (
              <div className="split-preview">
                <div className="split-preview-summary">
                  <span>Train: <b>{preview.trainCount}</b> ảnh</span>
                  <span>Valid: <b>{preview.validCount}</b> ảnh</span>
                  <span>Test: <b>{preview.testCount}</b> ảnh</span>
                </div>
                <div className="split-preview-table">
                  {preview.perClass.map((c) => (
                    <div key={c.class_id} className="split-preview-row">
                      <span className="split-preview-name" title={c.name}>{c.name}</span>
                      <span className="split-preview-count">{c.train} train</span>
                      <span className="split-preview-count">{c.valid} valid</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" onClick={runExport}>Xuất dataset</button>
        </div>
      </div>
    </div>
  );
}

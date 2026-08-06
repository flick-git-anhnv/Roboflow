import React, { useMemo, useState } from 'react';
import type { ModelInfo, Project } from '../../../types';
import { api } from '../../../api';

interface ModelManagerPanelProps {
  projectId?: string;
  project: Project | null;
  models: ModelInfo[];
  canReview: boolean;
  onRefreshData: () => void;
  onShowToast: (text: string, error?: boolean) => void;
}

export const ModelManagerPanel: React.FC<ModelManagerPanelProps> = ({
  projectId,
  project,
  models,
  canReview,
  onRefreshData,
  onShowToast,
}) => {
  const [settingDefault, setSettingDefault] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ notes: string; map_score: string; version_label: string }>({ notes: '', map_score: '', version_label: '' });
  const [savingModelMeta, setSavingModelMeta] = useState(false);

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      if (a.map_score != null && b.map_score != null) return b.map_score - a.map_score;
      if (a.map_score != null) return -1;
      if (b.map_score != null) return 1;
      return 0;
    });
  }, [models]);

  const bestModelId = useMemo(() => {
    const withScore = models.filter((m) => m.map_score != null);
    if (withScore.length === 0) return null;
    return withScore.reduce((best, m) => (m.map_score! > best.map_score! ? m : best)).id;
  }, [models]);

  return (
    <div>
      <h4>Quản lý Model</h4>
      {sortedModels.length === 0 ? (
        <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>
          Chưa có model nào. Upload model .pt qua nút "Auto Label".
        </p>
      ) : (
        <div>
          {sortedModels.map((m) => {
            const isDefault = project?.default_model_id === m.id;
            const isBest = bestModelId === m.id;
            const isEditing = editingModelId === m.id;
            return (
              <div key={m.id} style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                    title={m.original_name}>{m.original_name}</span>
                  {m.version_label && (
                    <span style={{ fontSize: 10, background: '#4A3F8C', color: '#fff', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                      {m.version_label}
                    </span>
                  )}
                  {isBest && (
                    <span style={{ fontSize: 10, background: '#F05922', color: '#fff', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                      ★ Best
                    </span>
                  )}
                  {isDefault && (
                    <span style={{ fontSize: 10, color: '#2e7d32', fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Mặc định</span>
                  )}
                </div>

                {(m.map_score != null || m.notes) && (
                  <div style={{ fontSize: 11, color: '#555', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {m.map_score != null && (
                      <span>mAP: <b>{(m.map_score * 100).toFixed(1)}%</b></span>
                    )}
                    {m.notes && (
                      <span style={{ color: '#777', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={m.notes}>{m.notes}</span>
                    )}
                  </div>
                )}

                {isEditing && canReview && (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input
                      type="text"
                      placeholder="Nhãn phiên bản (VD: v1, v2-aug)"
                      value={editDraft.version_label}
                      onChange={(e) => setEditDraft((d) => ({ ...d, version_label: e.target.value }))}
                      style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                    />
                    <input
                      type="number"
                      placeholder="mAP score (0–1, VD: 0.87)"
                      step="0.001"
                      min="0"
                      max="1"
                      value={editDraft.map_score}
                      onChange={(e) => setEditDraft((d) => ({ ...d, map_score: e.target.value }))}
                      style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                    />
                    <input
                      type="text"
                      placeholder="Ghi chú (dataset, thông số, ...)"
                      value={editDraft.notes}
                      onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                      style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        disabled={savingModelMeta}
                        onClick={async () => {
                          if (!projectId) return;
                          setSavingModelMeta(true);
                          try {
                            const mapVal = editDraft.map_score.trim() === '' ? null : Number(editDraft.map_score);
                            await api.updateModel(projectId, m.id, {
                              notes: editDraft.notes.trim() || null,
                              map_score: mapVal,
                              version_label: editDraft.version_label.trim() || null,
                            });
                            setEditingModelId(null);
                            onRefreshData();
                            onShowToast('Đã lưu metadata model');
                          } catch (err: unknown) {
                            onShowToast((err instanceof Error ? err.message : 'Lỗi lưu metadata'), true);
                          } finally { setSavingModelMeta(false); }
                        }}
                      >
                        {savingModelMeta ? 'Đang lưu...' : 'Lưu'}
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => setEditingModelId(null)}
                      >
                        Huỷ
                      </button>
                    </div>
                  </div>
                )}

                {!isEditing && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {canReview && (
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: 10, padding: '1px 5px' }}
                        onClick={() => {
                          setEditingModelId(m.id);
                          setEditDraft({
                            notes: m.notes ?? '',
                            map_score: m.map_score != null ? String(m.map_score) : '',
                            version_label: m.version_label ?? '',
                          });
                        }}
                      >
                        ✏️ Sửa
                      </button>
                    )}
                    {!isDefault && canReview && (
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: 10, padding: '1px 5px' }}
                        disabled={settingDefault}
                        onClick={async () => {
                          if (!projectId) return;
                          setSettingDefault(true);
                          try {
                            await api.setDefaultModel(projectId, m.id);
                            onRefreshData();
                            onShowToast(`Đã đặt "${m.original_name}" làm model mặc định`);
                          } catch { onShowToast('Lỗi khi đặt model mặc định', true); }
                          finally { setSettingDefault(false); }
                        }}
                      >
                        Đặt mặc định
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {project?.default_model_id && canReview && (
            <button
              className="btn btn-outline"
              style={{ fontSize: 11, marginTop: 2 }}
              disabled={settingDefault}
              onClick={async () => {
                if (!projectId) return;
                setSettingDefault(true);
                try {
                  await api.setDefaultModel(projectId, null);
                  onRefreshData();
                  onShowToast('Đã bỏ model mặc định');
                } catch { onShowToast('Lỗi', true); }
                finally { setSettingDefault(false); }
              }}
            >
              Bỏ mặc định
            </button>
          )}
          <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            Sắp xếp theo mAP giảm dần. Model mặc định dùng để gợi ý bbox tự động.
          </p>
        </div>
      )}
    </div>
  );
};

export default ModelManagerPanel;

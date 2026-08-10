/**
 * Phân công % công việc cho từng user trong project.
 * Admin: đặt %, "Chia ảnh" random-split ảnh CHƯA gán theo tỉ lệ %, "Gán lại từ đầu"
 * gỡ hết assigned_to để chia lại. Reviewer/annotator: chỉ xem tiến độ (read-only).
 */
import { useCallback, useEffect, useState } from 'react';
import { api, getCurrentUser } from '../api';
import type { AssignmentCandidate, ProjectAssignmentSummary } from '../types';

export default function AssignmentModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const [summary, setSummary] = useState<ProjectAssignmentSummary | null>(null);
  const [candidates, setCandidates] = useState<AssignmentCandidate[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({}); // user_id -> % đang gõ (string để cho phép rỗng khi xoá)
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getAssignments(projectId), isAdmin ? api.listAssignmentCandidates(projectId) : Promise.resolve([])])
      .then(([s, c]) => {
        setSummary(s);
        setCandidates(c);
        setDrafts(Object.fromEntries(s.assignments.map((a) => [a.user_id, String(a.percent)])));
        setLoading(false);
      })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const savePercents = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const assignments = Object.entries(drafts).map(([userId, v]) => ({
        user_id: Number(userId),
        percent: Math.max(0, Math.min(100, Number(v) || 0)),
      }));
      await api.saveAssignmentPercents(projectId, assignments);
      setMessage('Đã lưu %.');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeAssignment = async (userId: number) => {
    if (!confirm('Bạn có chắc chắn muốn xoá phân công của người này không?')) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await api.deleteAssignment(projectId, userId);
      setMessage('Đã xoá phân công.');
      
      const newDrafts = { ...drafts };
      delete newDrafts[userId];
      setDrafts(newDrafts);
      
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const distribute = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const res = await api.distributeAssignments(projectId);
      setMessage(res.message || `Đã chia ${res.distributed} ảnh chưa gán theo tỉ lệ %.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resetAll = async () => {
    if (!confirm('Gỡ gán TOÀN BỘ ảnh trong project để chia lại từ đầu? % đã lưu vẫn được giữ.')) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const res = await api.resetAssignments(projectId);
      setMessage(`Đã gỡ gán ${res.unassigned} ảnh — bấm "Chia ảnh" để phân công lại.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addCandidate = () => {
    if (!addUserId) return;
    setDrafts((prev) => ({ ...prev, [Number(addUserId)]: prev[Number(addUserId)] ?? '0' }));
    setAddUserId('');
  };

  const totalDraftPercent = Object.values(drafts).reduce((s, v) => s + (Number(v) || 0), 0);
  const rows = summary?.assignments ?? [];
  // Union giữa user đã có % (từ summary) và user mới thêm vào draft nhưng chưa lưu.
  const allUserIds = new Set([...rows.map((r) => r.user_id), ...Object.keys(drafts).map(Number)]);
  const candidateById = new Map(candidates.map((c) => [c.user_id, c]));
  const rowById = new Map(rows.map((r) => [r.user_id, r]));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-modal" style={{ maxWidth: 680, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h2>Phân công công việc</h2>

        {loading && <p style={{ color: '#666' }}>Đang tải...</p>}
        {error && <p style={{ color: '#e53e3e' }}>Lỗi: {error}</p>}
        {message && <p style={{ color: '#2E9E6C' }}>{message}</p>}

        {summary && (
          <>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              Tổng ảnh: <b>{summary.images.total}</b> — đã gán: <b>{summary.images.assigned}</b> — chưa gán: <b>{summary.images.unassigned}</b>
              {!isAdmin && ' (chỉ admin mới chỉnh được % và chia ảnh — bạn chỉ xem tiến độ)'}
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
                  <th style={{ padding: '4px 6px' }}>User</th>
                  <th style={{ padding: '4px 6px', width: 90 }}>% mục tiêu</th>
                  <th style={{ padding: '4px 6px' }}>Tiến độ</th>
                </tr>
              </thead>
              <tbody>
                {[...allUserIds].map((userId) => {
                  const row = rowById.get(userId);
                  const cand = candidateById.get(userId);
                  const name = row?.display_name ?? cand?.display_name ?? `User #${userId}`;
                  const color = row?.color ?? cand?.color ?? '#4A3F8C';
                  const assigned = row?.assigned_count ?? 0;
                  const done = row?.done_count ?? 0;
                  const donePct = assigned > 0 ? Math.round((done / assigned) * 100) : 0;
                  return (
                    <tr key={userId} style={{ borderBottom: '1px solid #f2f2f2' }}>
                      <td style={{ padding: '6px' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6 }} />
                        {name}
                      </td>
                      <td style={{ padding: '6px' }}>
                        {isAdmin ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="number" min={0} max={100} step={1}
                              value={drafts[userId] ?? '0'}
                              onChange={(e) => setDrafts((prev) => ({ ...prev, [userId]: e.target.value }))}
                              style={{ width: 60 }}
                            />
                            <button onClick={() => removeAssignment(userId)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }} title="Xoá phân công">
                              ✕
                            </button>
                          </div>
                        ) : (
                          <span>{row?.percent ?? 0}%</span>
                        )}
                      </td>
                      <td style={{ padding: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${donePct}%`, height: '100%', background: 'var(--orange, #F05922)' }} />
                          </div>
                          <span style={{ whiteSpace: 'nowrap', color: '#666' }}>{done}/{assigned} ({donePct}%)</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {allUserIds.size === 0 && (
                  <tr><td colSpan={3} style={{ padding: 8, color: '#888' }}>Chưa có ai được phân công.</td></tr>
                )}
              </tbody>
            </table>

            {isAdmin && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                  <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} style={{ flex: 1 }}>
                    <option value="">+ Thêm user vào phân công...</option>
                    {candidates.filter((c) => !allUserIds.has(c.user_id)).map((c) => (
                      <option key={c.user_id} value={c.user_id}>{c.display_name} ({c.role})</option>
                    ))}
                  </select>
                  <button className="btn btn-outline" onClick={addCandidate} disabled={!addUserId}>Thêm</button>
                </div>

                <p style={{ fontSize: 12, color: totalDraftPercent > 100 ? '#C0392B' : '#666', marginBottom: 12 }}>
                  Tổng %: <b>{totalDraftPercent}</b>{totalDraftPercent !== 100 && ' (không bắt buộc đúng 100% — phần % còn lại sẽ để ảnh chưa gán ai)'}
                  {totalDraftPercent > 100 && ' — vượt 100%, hãy giảm lại trước khi lưu'}
                </p>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={savePercents} disabled={busy || totalDraftPercent > 100}>
                    Lưu %
                  </button>
                  <button className="btn btn-secondary" onClick={distribute} disabled={busy || summary.images.unassigned === 0}>
                    Chia ảnh (còn {summary.images.unassigned} chưa gán)
                  </button>
                  <button className="btn btn-outline" onClick={resetAll} disabled={busy || summary.images.assigned === 0}>
                    Gán lại từ đầu
                  </button>
                </div>
              </>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

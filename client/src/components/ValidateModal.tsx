/**
 * STEP-6.3: Modal kiểm tra chất lượng dataset.
 * Hiển thị 3 nhóm kết quả: ảnh trùng, annotation lỗi, class không dùng.
 * Click vào ảnh/annotation → navigate đến AnnotatorPage của ảnh đó.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { ValidateResult } from '../types';

export default function ValidateModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .validateDataset(projectId)
      .then((data) => {
        setResult(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [projectId]);

  const goToImage = (imageId: string) => {
    onClose();
    navigate(`/projects/${projectId}/annotate/${imageId}`);
  };

  const handleAutoResolveDuplicates = async () => {
    if (!result || result.duplicates.length === 0) return;
    
    const idsToDelete = result.duplicates.flatMap((dup) => dup.imageIds.slice(1));
    if (idsToDelete.length === 0) return;
    
    if (!window.confirm(`Bạn có chắc chắn muốn xoá ${idsToDelete.length} ảnh trùng lặp (chỉ giữ lại 1 ảnh cho mỗi nhóm)?`)) return;
    
    setResolving(true);
    try {
      await api.batchDeleteImages(projectId, idsToDelete);
      const data = await api.validateDataset(projectId);
      setResult(data);
    } catch (err: any) {
      alert('Lỗi khi xoá ảnh trùng: ' + err.message);
    } finally {
      setResolving(false);
    }
  };

  const totalIssues = result
    ? result.duplicates.length + result.invalidAnnotations.length + result.unusedClasses.length
    : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal export-modal"
        style={{ maxWidth: 800, maxHeight: '85vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Kiểm tra dataset</h2>

        {loading && <p style={{ color: '#666' }}>Đang kiểm tra...</p>}
        {error && <p style={{ color: '#e53e3e' }}>Lỗi: {error}</p>}

        {result && (
          <>
            {result.isHashing && (
              <div style={{ background: '#e0f2fe', color: '#0369a1', padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13, border: '1px solid #bae6fd' }}>
                <strong>Lưu ý:</strong> Hệ thống đang quét ngầm dữ liệu để tìm ảnh trùng lặp (do có ảnh mới tải lên chưa được phân tích). Số lượng ảnh trùng lặp có thể tăng lên sau vài giây. Vui lòng đóng và mở lại bảng này sau giây lát để xem kết quả đầy đủ.
              </div>
            )}
            <p style={{ marginBottom: 16, color: totalIssues === 0 ? '#2E9E6C' : '#C0392B', fontWeight: 600 }}>
              {totalIssues === 0
                ? 'Dataset sạch — không phát hiện vấn đề nào.'
                : `Phát hiện ${totalIssues} vấn đề cần xem lại.`}
            </p>

            {/* ── Ảnh trùng lặp ── */}
            <section style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 15, margin: 0 }}>
                  Ảnh trùng lặp{' '}
                  <span
                    style={{
                      background: result.duplicates.length > 0 ? '#C0392B' : '#2E9E6C',
                      color: '#fff',
                      borderRadius: 10,
                      padding: '1px 8px',
                      fontSize: 12,
                    }}
                  >
                    {result.duplicates.length}
                  </span>
                </h3>
                {result.duplicates.length > 0 && (
                  <button 
                    className="btn btn-outline" 
                    style={{ fontSize: 12, padding: '4px 10px', background: '#f8d7da', color: '#721c24', borderColor: '#f5c6cb' }}
                    onClick={handleAutoResolveDuplicates}
                    disabled={resolving}
                  >
                    {resolving ? 'Đang xử lý...' : '🧹 Tự động xoá ảnh trùng'}
                  </button>
                )}
              </div>
              {result.duplicates.length === 0 ? (
                <p style={{ color: '#666', fontSize: 13 }}>Không có ảnh trùng.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {result.duplicates.map((dup, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#fff8f6',
                        border: '1px solid #f5c6bb',
                        borderRadius: 6,
                        padding: '10px',
                        fontSize: 13,
                      }}
                    >
                      <div style={{ color: '#888', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span>MD5: <code style={{ fontSize: 11 }}>{dup.hash.slice(0, 8)}...</code></span>
                        <span style={{ fontSize: 11, color: '#C0392B' }}>{dup.imageIds.length} ảnh</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {dup.images ? dup.images.map((img, idx) => (
                          <div 
                            key={img.id} 
                            style={{ 
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                              opacity: idx === 0 ? 1 : 0.6
                            }}
                          >
                            <img 
                              src={`/uploads/${projectId}/${img.filename}`} 
                              alt="thumbnail"
                              style={{ 
                                width: 50, height: 50, objectFit: 'cover', 
                                borderRadius: 4, cursor: 'pointer', 
                                border: idx === 0 ? '2px solid #2E9E6C' : '1px solid #ddd'
                              }}
                              onClick={() => goToImage(img.id)}
                              title={idx === 0 ? `Giữ lại: ${img.id}` : `Sẽ bị xoá: ${img.id}`}
                            />
                            <span style={{ fontSize: 10, color: idx === 0 ? '#2E9E6C' : '#999', fontWeight: idx === 0 ? 'bold' : 'normal' }}>
                              {idx === 0 ? 'Giữ' : 'Xoá'}
                            </span>
                          </div>
                        )) : dup.imageIds.map((imgId) => (
                          <button
                            key={imgId}
                            className="btn btn-outline"
                            style={{ fontSize: 11, padding: '2px 8px' }}
                            onClick={() => goToImage(imgId)}
                            title={`Mở ảnh ${imgId}`}
                          >
                            {imgId.slice(0, 8)}...
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Annotation lỗi tọa độ ── */}
            <section style={{ marginBottom: 20 }}>
              <h3 style={{ marginBottom: 8, fontSize: 15 }}>
                Annotation lỗi tọa độ{' '}
                <span
                  style={{
                    background: result.invalidAnnotations.length > 0 ? '#C0392B' : '#2E9E6C',
                    color: '#fff',
                    borderRadius: 10,
                    padding: '1px 8px',
                    fontSize: 12,
                  }}
                >
                  {result.invalidAnnotations.length}
                </span>
              </h3>
              {result.invalidAnnotations.length === 0 ? (
                <p style={{ color: '#666', fontSize: 13 }}>Không có annotation lỗi.</p>
              ) : (
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {result.invalidAnnotations.map((ann) => (
                    <div
                      key={ann.id}
                      style={{
                        background: '#fff8f6',
                        border: '1px solid #f5c6bb',
                        borderRadius: 6,
                        padding: '6px 12px',
                        marginBottom: 6,
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <span style={{ color: '#888' }}>Ann {ann.id.slice(0, 8)}...</span>
                        {' — '}
                        <span style={{ color: '#C0392B' }}>{ann.reason}</span>
                      </div>
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: 11, padding: '2px 8px', whiteSpace: 'nowrap' }}
                        onClick={() => goToImage(ann.imageId)}
                      >
                        Mở ảnh
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Class không dùng ── */}
            <section style={{ marginBottom: 8 }}>
              <h3 style={{ marginBottom: 8, fontSize: 15 }}>
                Class không dùng{' '}
                <span
                  style={{
                    background: result.unusedClasses.length > 0 ? '#E7A83E' : '#2E9E6C',
                    color: '#fff',
                    borderRadius: 10,
                    padding: '1px 8px',
                    fontSize: 12,
                  }}
                >
                  {result.unusedClasses.length}
                </span>
              </h3>
              {result.unusedClasses.length === 0 ? (
                <p style={{ color: '#666', fontSize: 13 }}>Mọi class đều được dùng.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.unusedClasses.map((cls) => (
                    <span
                      key={cls.id}
                      style={{
                        background: '#FFF3CD',
                        border: '1px solid #ffc107',
                        borderRadius: 12,
                        padding: '2px 10px',
                        fontSize: 13,
                        color: '#856404',
                      }}
                    >
                      {cls.name}
                    </span>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

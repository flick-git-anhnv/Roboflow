import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../../api';
import type { ClassLabel, Project } from '../../../types';
import { X, FileCode, Copy, UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';

interface ClassImportModalProps {
  projectId: string;
  onClose: () => void;
  onSuccess: (updatedClasses: ClassLabel[]) => void;
}

// Client-side YOLO data.yaml parser
function parseYoloYaml(content: string): string[] {
  const lines = content.split(/\r?\n/);
  let inNames = false;
  const names: string[] = [];

  // Match inline format: names: ['a', 'b'] hoặc names: [a, b]
  const inlineArrayMatch = content.match(/names\s*:\s*\[([^\]]+)\]/);
  if (inlineArrayMatch) {
    return inlineArrayMatch[1]
      .split(',')
      .map(n => n.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^names\s*:\s*$/.test(trimmed) || /^names\s*:\s*#/.test(trimmed)) {
      inNames = true;
      continue;
    }

    if (inNames) {
      // If line is not indented and not empty, names block has ended
      if (line.length > 0 && !/^\s/.test(line)) {
        inNames = false;
        continue;
      }

      const listMatch = trimmed.match(/^(?:-\s*|['"]?\d+['"]?\s*:\s*)\s*(.*)$/);
      if (listMatch) {
        const val = listMatch[1].trim().replace(/^['"]|['"]$/g, '');
        if (val) names.push(val);
      } else if (trimmed && !trimmed.startsWith('#')) {
        const val = trimmed.replace(/^['"]|['"]$/g, '');
        if (val) names.push(val);
      }
    }
  }
  return names;
}

export const ClassImportModal: React.FC<ClassImportModalProps> = ({
  projectId,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'yaml' | 'project'>('yaml');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab 1: YAML States
  const [localPath, setLocalPath] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [previewClasses, setPreviewClasses] = useState<string[]>([]);
  const [selectedPreviewClasses, setSelectedPreviewClasses] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab 2: Project copy States
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjId, setSelectedProjId] = useState('');
  const [sourceClasses, setSourceClasses] = useState<ClassLabel[]>([]);
  const [selectedSourceClasses, setSelectedSourceClasses] = useState<Set<string>>(new Set());

  // Load projects list for Tab 2
  useEffect(() => {
    api.listProjects()
      .then((list) => {
        setProjects(list.filter((p) => p.id !== projectId));
      })
      .catch((err) => {
        console.error('Failed to load projects:', err);
      });
  }, [projectId]);

  // Load classes of selected source project
  useEffect(() => {
    if (!selectedProjId) {
      setSourceClasses([]);
      setSelectedSourceClasses(new Set());
      return;
    }
    api.listClasses(selectedProjId)
      .then((clsList) => {
        setSourceClasses(clsList);
        setSelectedSourceClasses(new Set(clsList.map((c) => c.name)));
      })
      .catch((err) => {
        console.error('Failed to load classes from project:', err);
        setError('Không thể lấy danh sách class từ dự án được chọn.');
      });
  }, [selectedProjId]);

  // --- Handlers Tab 1: YAML ---
  const handleLocalYamlImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPath.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const updated = await api.importLocalYaml(projectId, localPath.trim());
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi import file YAML từ đường dẫn local.');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (file: File) => {
    setUploadedFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseYoloYaml(text);
        if (parsed.length === 0) {
          setError('Không tìm thấy danh sách class hoặc định dạng tệp không đúng.');
          setPreviewClasses([]);
          setSelectedPreviewClasses(new Set());
        } else {
          setPreviewClasses(parsed);
          setSelectedPreviewClasses(new Set(parsed));
        }
      } catch (err: any) {
        setError('Lỗi khi đọc file YAML: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleConfirmUploadedImport = async () => {
    if (selectedPreviewClasses.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const names = Array.from(selectedPreviewClasses);
      const updated = await api.importBulkClasses(projectId, names);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi import danh sách class.');
    } finally {
      setLoading(false);
    }
  };

  const togglePreviewClass = (name: string) => {
    setSelectedPreviewClasses((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const toggleAllPreview = () => {
    if (selectedPreviewClasses.size === previewClasses.length) {
      setSelectedPreviewClasses(new Set());
    } else {
      setSelectedPreviewClasses(new Set(previewClasses));
    }
  };

  // --- Handlers Tab 2: Project Copy ---
  const handleConfirmProjectCopy = async () => {
    if (selectedSourceClasses.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const names = Array.from(selectedSourceClasses);
      const updated = await api.importBulkClasses(projectId, names);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi sao chép danh sách class.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSourceClass = (name: string) => {
    setSelectedSourceClasses((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const toggleAllSource = () => {
    if (selectedSourceClasses.size === sourceClasses.length) {
      setSelectedSourceClasses(new Set());
    } else {
      setSelectedSourceClasses(new Set(sourceClasses.map((c) => c.name)));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-modal" style={{ maxWidth: 550 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Import / Sao chép nhãn</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="stats-modal-tabs my-4" style={{ display: 'flex', borderBottom: '1px solid #ddd', paddingBottom: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'yaml' ? 'active' : ''}`}
            onClick={() => { setActiveTab('yaml'); setError(null); }}
            style={{ marginRight: 16 }}
          >
            <FileCode size={16} />
            <span>Từ file data.yaml (YOLO)</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'project' ? 'active' : ''}`}
            onClick={() => { setActiveTab('project'); setError(null); }}
          >
            <Copy size={16} />
            <span>Từ dự án khác</span>
          </button>
        </div>

        {error && (
          <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 6, backgroundColor: '#fdf2f2', color: '#c0392b', marginBottom: 16, fontSize: 13, border: '1px solid #f8d7da' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Tab 1 Content: YAML */}
        {activeTab === 'yaml' && (
          <div>
            {previewClasses.length === 0 ? (
              <div>
                {/* Method 1: Local Path Input */}
                <form onSubmit={handleLocalYamlImport} className="field" style={{ marginBottom: 20 }}>
                  <label style={{ fontWeight: 500, display: 'block', marginBottom: 6 }}>Cách 1: Nhập đường dẫn file YAML tuyệt đối trên máy chủ</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ví dụ: C:\Users\nguye\Desktop\LAO-LPR-yolo\data.yaml"
                      value={localPath}
                      onChange={(e) => setLocalPath(e.target.value)}
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                      disabled={loading}
                    />
                    <button type="submit" className="btn btn-primary" disabled={loading || !localPath.trim()}>
                      {loading ? 'Đang đọc...' : 'Đọc & Import'}
                    </button>
                  </div>
                  <span style={{ fontSize: 11, color: '#666', marginTop: 4, display: 'block' }}>
                    Yêu cầu máy chủ Backend có quyền truy cập trực tiếp tới đường dẫn này.
                  </span>
                </form>

                <div style={{ textAlign: 'center', margin: '16px 0', color: '#888', fontWeight: 500 }}>— HOẶC —</div>

                {/* Method 2: Browser Upload */}
                <div className="field">
                  <label style={{ fontWeight: 500, display: 'block', marginBottom: 6 }}>Cách 2: Chọn/tải file YAML từ máy khách</label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: isDragging ? '2px dashed #F05922' : '2px dashed #bbb',
                      borderRadius: 6,
                      padding: '24px 16px',
                      cursor: 'pointer',
                      backgroundColor: isDragging ? '#fff6f3' : '#f9f9f9',
                      textAlign: 'center',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <UploadCloud size={32} style={{ color: isDragging ? '#F05922' : '#666', marginBottom: 8 }} />
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#333' }}>
                      {uploadedFileName ? `Đã chọn: ${uploadedFileName}` : 'Nhấp hoặc kéo thả file .yaml / .yml vào đây'}
                    </span>
                    <span style={{ fontSize: 12, color: '#777', marginTop: 4 }}>Phân tích cú pháp phía client</span>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".yaml,.yml"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Preview of parsed classes from uploaded file */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 500 }}>Danh sách class tìm thấy ({previewClasses.length}):</span>
                  <button className="btn btn-link" style={{ padding: 0, fontSize: 13 }} onClick={toggleAllPreview}>
                    {selectedPreviewClasses.size === previewClasses.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 4, padding: 8, backgroundColor: '#fcfcfc', marginBottom: 16 }}>
                  {previewClasses.map((name) => (
                    <label key={name} style={{ display: 'flex', alignItems: 'center', padding: '6px 4px', cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={selectedPreviewClasses.has(name)}
                        onChange={() => togglePreviewClass(name)}
                        style={{ marginRight: 8 }}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>

                <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-outline" onClick={() => { setPreviewClasses([]); setUploadedFileName(''); }} disabled={loading}>
                    Quay lại
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleConfirmUploadedImport}
                    disabled={loading || selectedPreviewClasses.size === 0}
                  >
                    {loading ? 'Đang import...' : `Xác nhận thêm ${selectedPreviewClasses.size} nhãn`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2 Content: Project Copy */}
        {activeTab === 'project' && (
          <div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 500, display: 'block', marginBottom: 6 }}>Chọn dự án nguồn</label>
              <select
                className="form-control"
                value={selectedProjId}
                onChange={(e) => setSelectedProjId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                disabled={loading}
              >
                <option value="">-- Chọn dự án --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                ))}
              </select>
            </div>

            {selectedProjId && sourceClasses.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 20, color: '#666', fontSize: 13 }}>
                Dự án này không có nhãn nào.
              </div>
            )}

            {sourceClasses.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 500 }}>Danh sách class sao chép ({sourceClasses.length}):</span>
                  <button className="btn btn-link" style={{ padding: 0, fontSize: 13 }} onClick={toggleAllSource}>
                    {selectedSourceClasses.size === sourceClasses.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 4, padding: 8, backgroundColor: '#fcfcfc', marginBottom: 16 }}>
                  {sourceClasses.map((cls) => (
                    <label key={cls.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 4px', cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={selectedSourceClasses.has(cls.name)}
                        onChange={() => toggleSourceClass(cls.name)}
                        style={{ marginRight: 8 }}
                      />
                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', backgroundColor: cls.color, marginRight: 8 }}></span>
                      <span>{cls.name}</span>
                    </label>
                  ))}
                </div>

                <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-outline" onClick={() => setSelectedProjId('')} disabled={loading}>
                    Quay lại
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleConfirmProjectCopy}
                    disabled={loading || selectedSourceClasses.size === 0}
                  >
                    {loading ? 'Đang sao chép...' : `Sao chép ${selectedSourceClasses.size} nhãn`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassImportModal;

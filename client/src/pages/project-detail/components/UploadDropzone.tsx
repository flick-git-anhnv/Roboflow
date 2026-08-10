import React, { RefObject } from 'react';

interface UploadDropzoneProps {
  dragOver: boolean;
  uploading: boolean;
  uploadProgress?: { current: number; total: number; stage?: string } | null;
  fileInputRef: RefObject<HTMLInputElement>;
  setDragOver: (drag: boolean) => void;
  onHandleFiles: (files: FileList | File[] | DataTransfer) => void;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  dragOver,
  uploading,
  uploadProgress,
  fileInputRef,
  setDragOver,
  onHandleFiles,
}) => {
  const renderContent = () => {
    if (uploading) {
      if (uploadProgress) {
        const { current, total, stage } = uploadProgress;
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        const label = stage || `Đang tải ảnh lên (${current}/${total}) - ${percent}%`;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', padding: '0 20px' }}>
            <span style={{ fontWeight: 600, color: 'var(--navy-light)' }}>{label}</span>
            {total > 0 && (
              <div style={{ width: '100%', maxWidth: 400, height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent-color)', borderRadius: 4, transition: 'width 0.2s ease-in-out' }} />
              </div>
            )}
          </div>
        );
      }
      return <span style={{ fontWeight: 600, color: 'var(--navy-light)' }}>Đang tải ảnh lên...</span>;
    }
    return 'Kéo & thả ảnh, cả thư mục, hoặc file .zip vào đây, hoặc bấm để chọn file (JPG, PNG, WEBP, ZIP)';
  };

  return (
    <div
      className={`dropzone ${dragOver ? 'dragover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onHandleFiles(e.dataTransfer);
      }}
      onClick={() => !uploading && fileInputRef.current?.click()}
      style={{ marginBottom: 16, cursor: uploading ? 'not-allowed' : 'pointer' }}
    >
      {renderContent()}
    </div>
  );
};

export default UploadDropzone;

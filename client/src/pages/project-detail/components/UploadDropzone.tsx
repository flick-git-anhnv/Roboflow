import React, { RefObject } from 'react';
import { getFilesFromDataTransfer } from '../../../utils/files';

interface UploadDropzoneProps {
  dragOver: boolean;
  uploading: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  setDragOver: (drag: boolean) => void;
  onHandleFiles: (files: FileList | File[]) => void;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  dragOver,
  uploading,
  fileInputRef,
  setDragOver,
  onHandleFiles,
}) => {
  return (
    <div
      className={`dropzone ${dragOver ? 'dragover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragOver(false);
        const files = await getFilesFromDataTransfer(e.dataTransfer);
        if (files.length) onHandleFiles(files);
      }}
      onClick={() => fileInputRef.current?.click()}
      style={{ marginBottom: 16 }}
    >
      {uploading ? 'Đang tải ảnh lên...' : 'Kéo & thả ảnh, cả thư mục, hoặc file .zip vào đây, hoặc bấm để chọn file (JPG, PNG, WEBP, ZIP)'}
    </div>
  );
};

export default UploadDropzone;

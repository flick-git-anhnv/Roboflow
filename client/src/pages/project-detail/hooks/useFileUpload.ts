import { useRef, useState } from 'react';
import { api } from '../../../api';
import { isImageFile, isZipFile } from '../../../utils/files';

export function useFileUpload(
  projectId: string | undefined,
  load: () => void,
  showToast: (text: string, error?: boolean) => void,
) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    if (!projectId) return;
    const all = Array.from(files);
    const zips = all.filter(isZipFile);
    const images = all.filter(isImageFile);

    if (!zips.length && !images.length) {
      showToast('Không tìm thấy file ảnh hoặc file zip hợp lệ', true);
      return;
    }

    setUploading(true);
    try {
      let totalCreated = 0;
      let totalSkipped = 0;

      if (images.length) {
        const created = await api.uploadImages(projectId, images);
        totalCreated += created.length;
      }
      for (const zip of zips) {
        const result = await api.uploadZip(projectId, zip);
        totalCreated += result.created.length;
        totalSkipped += result.skipped;
      }

      load();
      const parts = [`Tải lên thành công ${totalCreated} ảnh`];
      if (totalSkipped) parts.push(`bỏ qua ${totalSkipped} file lỗi trong zip`);
      showToast(parts.join(', '));
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setUploading(false);
    }
  };

  return {
    dragOver,
    setDragOver,
    uploading,
    fileInputRef,
    folderInputRef,
    zipInputRef,
    handleFiles,
  };
}

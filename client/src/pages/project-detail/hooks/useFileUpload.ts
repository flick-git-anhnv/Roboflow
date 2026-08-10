import { useRef, useState } from 'react';
import { api } from '../../../api';
import { getFilesFromDataTransfer, isImageFile, isZipFile } from '../../../utils/files';

export function useFileUpload(
  projectId: string | undefined,
  load: () => void,
  showToast: (text: string, error?: boolean) => void,
  checkDuplicates: boolean,
) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; stage?: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (input: FileList | File[] | DataTransfer) => {
    if (!projectId) return;
    setUploading(true);
    setUploadProgress({ current: 0, total: 0, stage: 'Đang quét dữ liệu...' });

    try {
      let files: File[] = [];
      if (input instanceof DataTransfer) {
        files = await getFilesFromDataTransfer(input);
      } else if (input instanceof FileList) {
        files = Array.from(input);
      } else {
        files = input;
      }

      const zips = files.filter(isZipFile);
      const images = files.filter(isImageFile);

      const totalFiles = zips.length + images.length;
      if (totalFiles === 0) {
        showToast('Không tìm thấy file ảnh hoặc file zip hợp lệ', true);
        return;
      }

      setUploadProgress({ current: 0, total: totalFiles, stage: 'Chuẩn bị tải lên...' });

      let totalCreated = 0;
      let totalSkipped = 0;
      let totalDuplicated = 0;
      let currentProgress = 0;

      // 1. Process Images in Batches of 20
      const BATCH_SIZE = 20;
      if (images.length > 0) {
        for (let i = 0; i < images.length; i += BATCH_SIZE) {
          const batch = images.slice(i, i + BATCH_SIZE);
          setUploadProgress({
            current: currentProgress,
            total: totalFiles,
            stage: `Đang tải ảnh lên (${currentProgress}/${totalFiles})...`,
          });

          const result = await api.uploadImages(projectId, batch, checkDuplicates);
          if (checkDuplicates && result && typeof result === 'object' && !Array.isArray(result)) {
            totalCreated += (result.created || []).length;
            totalDuplicated += result.duplicated || 0;
          } else if (Array.isArray(result)) {
            totalCreated += result.length;
          } else {
            totalCreated += (result || []).length;
          }

          currentProgress += batch.length;
        }
      }

      // 2. Process Zips one-by-one
      if (zips.length > 0) {
        for (const zip of zips) {
          setUploadProgress({
            current: currentProgress,
            total: totalFiles,
            stage: `Đang giải nén & tải zip lên (${currentProgress}/${totalFiles})...`,
          });

          const result = await api.uploadZip(projectId, zip, checkDuplicates);
          if (result && typeof result === 'object') {
            totalCreated += (result.created || []).length;
            totalSkipped += result.skipped || 0;
            if (checkDuplicates) {
              totalDuplicated += result.duplicated || 0;
            }
          }
          currentProgress += 1;
        }
      }

      setUploadProgress({ current: totalFiles, total: totalFiles, stage: 'Đang hoàn tất...' });
      load();

      const parts = [`Tải lên thành công ${totalCreated} ảnh`];
      if (totalSkipped) parts.push(`bỏ qua ${totalSkipped} file lỗi trong zip`);
      if (totalDuplicated) parts.push(`bỏ qua ${totalDuplicated} ảnh trùng lặp`);
      showToast(parts.join(', '));
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  return {
    dragOver,
    setDragOver,
    uploading,
    uploadProgress,
    fileInputRef,
    folderInputRef,
    zipInputRef,
    handleFiles,
  };
}

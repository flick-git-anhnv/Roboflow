import { useCallback, useState } from 'react';
import { api } from '../../../api';
import type { ImageItem, Split } from '../../../types';

export function useBatchSelection(
  projectId: string | undefined,
  setImages: React.Dispatch<React.SetStateAction<ImageItem[]>>,
  load: () => void,
  showToast: (text: string, error?: boolean) => void,
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string, e?: React.MouseEvent | React.ChangeEvent | any) => {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectPage = useCallback((pagedImages: ImageItem[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pagedImages.forEach((img) => next.add(img.id));
      return next;
    });
  }, []);

  const batchChangeSplit = async (split: Split) => {
    if (!projectId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const count = ids.length;
    try {
      await api.batchUpdateImages(projectId, ids, { split });
      clearSelection();
      load();
      showToast(`Đã đổi split → ${split} cho ${count} ảnh`);
    } catch (e: any) {
      showToast(e.message, true);
    }
  };

  const batchDelete = async () => {
    if (!projectId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const count = ids.length;
    if (!confirm(`Bạn sắp xoá ${count} ảnh. Thao tác này không thể hoàn tác.`)) return;
    try {
      await api.batchDeleteImages(projectId, ids);
      const deletedSet = new Set(ids);
      setImages((imgs) => imgs.filter((i) => !deletedSet.has(i.id)));
      clearSelection();
      showToast(`Đã xoá ${count} ảnh`);
    } catch (e: any) {
      showToast(e.message, true);
    }
  };

  return {
    selectedIds,
    setSelectedIds,
    toggleSelect,
    clearSelection,
    selectPage,
    batchChangeSplit,
    batchDelete,
  };
}

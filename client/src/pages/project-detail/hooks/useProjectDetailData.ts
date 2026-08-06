import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import type { ClassLabel, ImageItem, ModelInfo, Project, Split } from '../../../types';

export function useProjectDetailData(projectId: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [classes, setClasses] = useState<ClassLabel[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);

  const load = useCallback(() => {
    if (!projectId) return;
    api.getProject(projectId).then(setProject);
    api.listClasses(projectId).then(setClasses);
    api.listImages(projectId).then(setImages);
    api.listModels(projectId).then(setModels);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const addClass = async () => {
    if (!projectId) return;
    const colors = ['#F05922', '#251C53', '#4A3F8C', '#2E9E6C', '#C0392B', '#1B9CFC', '#9B59B6', '#E7A83E'];
    const color = colors[classes.length % colors.length];
    const created = await api.createClass(projectId, `class_${classes.length + 1}`, color);
    setClasses((c) => [...c, created]);
  };

  const updateClass = async (cls: ClassLabel, patch: Partial<ClassLabel>) => {
    if (!projectId) return;
    const updated = await api.updateClass(projectId, cls.id, patch);
    setClasses((cs) => cs.map((c) => (c.id === cls.id ? updated : c)));
  };

  const removeClass = async (cls: ClassLabel, onClassRemoved?: (clsId: string) => void) => {
    if (!projectId) return;
    if (!confirm(`Xoá nhãn "${cls.name}"? Các annotation dùng nhãn này cũng sẽ bị xoá.`)) return;
    await api.deleteClass(projectId, cls.id);
    setClasses((cs) => cs.filter((c) => c.id !== cls.id));
    if (onClassRemoved) onClassRemoved(cls.id);
  };

  const removeAllClasses = async () => {
    if (!projectId) return;
    if (!confirm('Bạn có chắc chắn muốn xoá TẤT CẢ nhãn trong dự án này? Toàn bộ annotation dùng các nhãn này cũng sẽ bị xoá.')) return;
    await api.deleteAllClasses(projectId);
    setClasses([]);
  };

  const removeImage = async (img: ImageItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!projectId) return;
    if (!confirm('Xoá ảnh này khỏi project?')) return;
    await api.deleteImage(projectId, img.id);
    setImages((imgs) => imgs.filter((i) => i.id !== img.id));
  };

  const changeSplit = async (img: ImageItem, split: Split, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!projectId) return;
    const updated = await api.updateImage(projectId, img.id, { split });
    setImages((imgs) => imgs.map((i) => (i.id === img.id ? { ...updated, class_ids: i.class_ids } : i)));
  };

  return {
    project,
    setProject,
    classes,
    setClasses,
    images,
    setImages,
    models,
    setModels,
    load,
    addClass,
    updateClass,
    removeClass,
    removeAllClasses,
    removeImage,
    changeSplit,
  };
}

export default useProjectDetailData;

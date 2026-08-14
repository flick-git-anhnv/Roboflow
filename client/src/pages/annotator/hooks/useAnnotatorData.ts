import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../api';
import type { Annotation, ClassLabel, ImageItem, ImageWithAnnotations, Project } from '../../../types';
import type { Box } from '../types';
import { annotationToBox, suggestionToBox } from '../utils';

export function useAnnotatorData(
  projectId?: string,
  imageId?: string,
  onClearHistory?: () => void,
) {
  const [project, setProject] = useState<Project | null>(null);
  const [classes, setClasses] = useState<ClassLabel[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [image, setImage] = useState<ImageWithAnnotations | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [activeClassId, setActiveClassId] = useState<string>('');
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [doneBusy, setDoneBusy] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillCount, setPrefillCount] = useState(0);
  const [copyingLabels, setCopyingLabels] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);
  const annotationVersionRef = useRef<number>(0);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingSaveRef.current) {
      const saveFn = pendingSaveRef.current;
      pendingSaveRef.current = null;
      await saveFn();
    }
  }, []);

  // Fetch classes, images and project details
  useEffect(() => {
    if (!projectId) return;
    api.getProject(projectId).then(setProject);
    api.listClasses(projectId).then((cs) => {
      setClasses(cs);
      setActiveClassId((prev) => prev || cs[0]?.id || '');
    });
    api.listImages(projectId).then(setImages);
  }, [projectId]);

  // Fetch single image data
  useEffect(() => {
    if (!projectId || !imageId) return;
    
    // Flush any pending save of the previous image before loading the new one
    flushSave();

    let cancelled = false;

    setImage(null);
    setBoxes([]);
    setPrefillLoading(false);
    setPrefillCount(0);
    if (onClearHistory) onClearHistory();

    api.getImage(projectId, imageId).then((img) => {
      if (cancelled) return;
      setImage(img);
      const imgBoxes = img.annotations.map((a: Annotation) => annotationToBox(a));
      setBoxes(imgBoxes);
      setSaveState('saved');
      annotationVersionRef.current = img.annotationVersion ?? 0;

      if (imgBoxes.length === 0) {
        setPrefillLoading(true);
        api.getPrefill(projectId, imageId)
          .then((data) => {
            if (cancelled) return;
            setPrefillLoading(false);
            if (data.suggestions.length > 0) {
              setBoxes(data.suggestions.map(suggestionToBox));
              setPrefillCount(data.suggestions.length);
            }
          })
          .catch(() => {
            if (!cancelled) setPrefillLoading(false);
          });
      }
    });

    return () => {
      cancelled = true;
      flushSave();
    };
  }, [projectId, imageId, flushSave]);

  const scheduleSave = useCallback((nextBoxes: Box[]) => {
    setSaveState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);

    const saveFn = async () => {
      if (!imageId) return;
      setSaveState('saving');
      try {
        const result = await api.saveAnnotations(
          imageId,
          nextBoxes.map((b) => ({
            class_id: b.class_id, x: b.x, y: b.y, w: b.w, h: b.h,
            type: b.type, points: b.type === 'quad' && b.points ? b.points : null,
            text_content: b.text_content || null,
          })),
          annotationVersionRef.current,
        );
        annotationVersionRef.current = result.annotationVersion;
        setSaveState('saved');
        if (onClearHistory) onClearHistory();
        setImages((imgs) => imgs.map((i) => (i.id === imageId ? { ...i, status: nextBoxes.length ? 'labeled' : 'unlabeled' } : i)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'ANNOTATION_CONFLICT') {
          setSaveState('saved');
          alert('Ảnh này đã được người khác sửa. Đang tải lại bản mới nhất — thay đổi chưa lưu của bạn sẽ bị mất.');
          if (projectId) {
            api.getImage(projectId, imageId).then((img) => {
              setImage(img);
              setBoxes(img.annotations.map((a: Annotation) => annotationToBox(a)));
              annotationVersionRef.current = img.annotationVersion ?? 0;
              setSaveState('saved');
              if (onClearHistory) onClearHistory();
            }).catch(() => {});
          }
        } else {
          setSaveState('dirty');
          console.error('[AnnotatorPage] Save failed:', msg);
        }
      }
      pendingSaveRef.current = null;
    };

    pendingSaveRef.current = saveFn;
    saveTimer.current = setTimeout(saveFn, 600);
  }, [imageId, projectId, onClearHistory]);

  const handleSubmitReview = useCallback(async () => {
    if (!image) return;
    setReviewBusy(true);
    try {
      const updated = await api.submitReview(image.id);
      setImage((img) => (img ? { ...img, review_status: updated.review_status, review_comment: updated.review_comment } : img));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gửi duyệt thất bại');
    } finally {
      setReviewBusy(false);
    }
  }, [image]);

  const handleApprove = useCallback(async () => {
    if (!image) return;
    setReviewBusy(true);
    try {
      const updated = await api.approveReview(image.id);
      setImage((img) => (img ? { ...img, review_status: updated.review_status, review_comment: updated.review_comment } : img));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Duyệt thất bại');
    } finally {
      setReviewBusy(false);
    }
  }, [image]);

  const handleReject = useCallback(async () => {
    if (!image) return;
    const comment = window.prompt('Lý do từ chối (annotator sẽ thấy):', '') || '';
    setReviewBusy(true);
    try {
      const updated = await api.rejectReview(image.id, comment);
      setImage((img) => (img ? { ...img, review_status: updated.review_status, review_comment: updated.review_comment } : img));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Từ chối thất bại');
    } finally {
      setReviewBusy(false);
    }
  }, [image]);

  const handleMarkDone = useCallback(async () => {
    if (!image || !projectId) return;
    setDoneBusy(true);
    try {
      const updated = await api.markImageDone(projectId, image.id);
      setImage((img) => img ? { ...img, completed_at: updated.completed_at, completed_by: updated.completed_by } : img);
      setImages((imgs) => imgs.map((i) => i.id === image.id ? { ...i, completed_at: updated.completed_at, completed_by: updated.completed_by } : i));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Đánh dấu xong thất bại');
    } finally {
      setDoneBusy(false);
    }
  }, [image, projectId]);

  const handleUnmarkDone = useCallback(async () => {
    if (!image || !projectId) return;
    if (!confirm('Bỏ đánh dấu "Xong" cho ảnh này?')) return;
    setDoneBusy(true);
    try {
      const updated = await api.unmarkImageDone(projectId, image.id);
      setImage((img) => img ? { ...img, completed_at: updated.completed_at, completed_by: updated.completed_by } : img);
      setImages((imgs) => imgs.map((i) => i.id === image.id ? { ...i, completed_at: updated.completed_at, completed_by: updated.completed_by } : i));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Bỏ đánh dấu xong thất bại');
    } finally {
      setDoneBusy(false);
    }
  }, [image, projectId]);

  return {
    project,
    classes,
    setClasses,
    images,
    setImages,
    image,
    setImage,
    boxes,
    setBoxes,
    activeClassId,
    setActiveClassId,
    saveState,
    setSaveState,
    reviewBusy,
    doneBusy,
    prefillLoading,
    prefillCount,
    setPrefillCount,
    copyingLabels,
    setCopyingLabels,
    annotationVersionRef,
    scheduleSave,
    flushSave,
    handleSubmitReview,
    handleApprove,
    handleReject,
    handleMarkDone,
    handleUnmarkDone,
    removeImageFromList: useCallback((deletedId: string) => {
      setImages((prev) => prev.filter((i) => i.id !== deletedId));
    }, []),
  };
}

export default useAnnotatorData;

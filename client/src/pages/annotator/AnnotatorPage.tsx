import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCurrentUser, requestSamPolygon, requestPromptAutoLabel } from '../../api';
import type { ClassLabel, Point } from '../../types';
import type { Box, DragMode, Handle, Tool } from './types';
import { boundingRect, clamp, cloneBox, drawLabel, fuzzyMatch, HANDLE_SIZE, pointInPolygon } from './utils';

import AnnotatorToolbar from './components/AnnotatorToolbar';
import AnnotatorCanvas from './components/AnnotatorCanvas';
import ClassPickerPanel from './components/ClassPickerPanel';
import AnnotationListPanel from './components/AnnotationListPanel';
import FilmstripBar from './components/FilmstripBar';
import QuickClassSwitcherModal from './components/QuickClassSwitcherModal';
import PrefillBanner from './components/PrefillBanner';
import QuadHintBanner from './components/QuadHintBanner';
import AutoLabelModal from '../../components/AutoLabelModal';

import useAnnotatorData from './hooks/useAnnotatorData';
import useUndoRedo from './hooks/useUndoRedo';
import useZoomPan from './hooks/useZoomPan';
import useClipboard from './hooks/useClipboard';
import useHotkeys from './hooks/useHotkeys';

const DRAWING_ID = '__drawing__';
const HANDLE_CURSOR: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

export default function AnnotatorPage() {
  const { projectId, imageId } = useParams<{ projectId: string; imageId: string }>();
  const navigate = useNavigate();

  const currentUser = getCurrentUser();
  const canReview = currentUser?.role === 'reviewer' || currentUser?.role === 'admin';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [spotlightEnabled, setSpotlightEnabled] = useState<boolean>(true);

  const selectOnly = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedIds(id ? new Set([id]) : new Set());
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setSelectedId(id);
  }, []);

  const [tool, setTool] = useState<Tool>('bbox');
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);

  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const dragRef = useRef<{
    mode: DragMode; handle: Handle; startX: number; startY: number; orig?: Box;
    groupOrig?: Box[];
  }>({
    mode: 'none', handle: null, startX: 0, startY: 0,
  });

  const windowListenersRef = useRef<{ move?: (e: MouseEvent) => void; up?: () => void }>({});
  const [selectRect, setSelectRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const selectRectRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const [scale, setScale] = useState(1);

  // Filmstrip
  const filmstripRef = useRef<HTMLDivElement>(null);
  const [showFilmstrip, setShowFilmstrip] = useState<boolean>(() => {
    try { return localStorage.getItem('filmstrip_visible') !== 'false'; } catch { return true; }
  });

  // MRU Classes
  const [mruClassIds, setMruClassIds] = useState<string[]>(() => {
    if (!projectId) return [];
    try {
      const stored = localStorage.getItem(`mru_classes_${projectId}`);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch { return []; }
  });

  // Quick Switcher Modal
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [switcherQuery, setSwitcherQuery] = useState('');
  const [switcherIdx, setSwitcherIdx] = useState(0);
  const switcherInputRef = useRef<HTMLInputElement>(null);

  // Grounding DINO Prompt Modal
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptText, setPromptText] = useState('car');
  const [promptBusy, setPromptBusy] = useState(false);

  // Auto Label Modal
  const [autoLabelOpen, setAutoLabelOpen] = useState(false);

  const handleRunPromptAutoLabel = async () => {
    if (!projectId || !promptText.trim()) return;
    setPromptBusy(true);
    try {
      const res = await requestPromptAutoLabel(projectId, promptText.trim());
      alert(res.message);
      setShowPromptModal(false);
      window.location.reload();
    } catch (err: any) {
      alert('Lỗi gán nhãn tự động: ' + err.message);
    } finally {
      setPromptBusy(false);
    }
  };

  // Core Data & API Hook
  const {
    project,
    classes,
    images,
    image,
    boxes,
    setBoxes,
    activeClassId,
    setActiveClassId,
    saveState,
    reviewBusy,
    doneBusy,
    prefillLoading,
    prefillCount,
    setPrefillCount,
    copyingLabels,
    setCopyingLabels,
    scheduleSave,
    flushSave,
    handleSubmitReview,
    handleApprove,
    handleReject,
    handleMarkDone,
    handleUnmarkDone,
    removeImageFromList,
  } = useAnnotatorData(projectId, imageId);

  // Undo/Redo Hook
  const {
    boxesRef,
    preDragSnapshotRef,
    lastDrawnSizeRef,
    undoSize,
    redoSize,
    pushHistorySnapshot,
    clearHistory,
    undo,
    redo,
  } = useUndoRedo(boxes, setBoxes, scheduleSave, setPrefillCount);

  // Zoom & Pan Hook
  const {
    zoom,
    setZoom,
    spaceHeld,
    isPanning,
    setZoomClamped,
    startPan,
  } = useZoomPan(image, containerRef);

  // Clipboard Hook
  const {
    hasClipboard,
    lastMousePosRef,
    clipboardBoxRef,
    copySelectedBox,
    pasteBox,
  } = useClipboard(image, boxesRef, selectedId, pushHistorySnapshot, setPrefillCount, setBoxes, scheduleSave, setSelectedId);

  // Image Element loading effect
  useEffect(() => {
    if (!projectId || !image) {
      setImgEl(null);
      return;
    }
    let cancelled = false;
    selectOnly(null);
    setDrawingPoints([]);

    const el = new window.Image();
    el.onload = () => { if (!cancelled) setImgEl(el); };
    el.src = `/uploads/${projectId}/${image.filename}`;
    return () => { cancelled = true; };
  }, [projectId, image, selectOnly]);

  // Filmstrip auto scroll
  useEffect(() => {
    if (!showFilmstrip || !filmstripRef.current) return;
    const el = filmstripRef.current.querySelector(`[data-id="${imageId}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [imageId, showFilmstrip]);

  const currentIndex = useMemo(() => images.findIndex((i) => i.id === imageId), [images, imageId]);
  const prevImageItem = currentIndex > 0 ? images[currentIndex - 1] : null;

  const goTo = useCallback((delta: number) => {
    const next = images[currentIndex + delta];
    if (next) navigate(`/projects/${projectId}/annotate/${next.id}`);
  }, [images, currentIndex, navigate, projectId]);

  const goToImageId = useCallback((id: string) => {
    navigate(`/projects/${projectId}/annotate/${id}`);
  }, [navigate, projectId]);

  const toggleFilmstrip = useCallback(() => {
    setShowFilmstrip((prev) => {
      const next = !prev;
      try { localStorage.setItem('filmstrip_visible', String(next)); } catch {}
      return next;
    });
  }, []);

  const pushToMru = useCallback((classId: string) => {
    setMruClassIds((prev) => {
      const filtered = prev.filter((id) => id !== classId);
      const next = [classId, ...filtered].slice(0, 9);
      try { if (projectId) localStorage.setItem(`mru_classes_${projectId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [projectId]);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const switcherResults = useMemo(
    () => classes.filter((c) => fuzzyMatch(switcherQuery, c.name)),
    [classes, switcherQuery],
  );

  useEffect(() => {
    if (showSwitcher) {
      const t = setTimeout(() => switcherInputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [showSwitcher]);

  const updateBoxes = (updater: (prev: Box[]) => Box[]) => {
    pushHistorySnapshot();
    setPrefillCount(0);
    setBoxes((prev) => {
      const next = updater(prev);
      scheduleSave(next);
      return next;
    });
  };

  const copyLabelsFromPrev = useCallback(async () => {
    const prevImg = currentIndex > 0 ? images[currentIndex - 1] : null;
    if (!prevImg || !projectId) return;

    setCopyingLabels(true);
    let prevAnnotations: any[];
    try {
      const { api } = await import('../../api');
      const prevImgData = await api.getImage(projectId, prevImg.id);
      prevAnnotations = prevImgData.annotations;
    } catch {
      alert('Không thể lấy annotation từ ảnh trước. Vui lòng thử lại.');
      setCopyingLabels(false);
      return;
    }
    setCopyingLabels(false);

    if (prevAnnotations.length === 0) {
      alert('Ảnh trước không có annotation nào để copy.');
      return;
    }

    const currentBoxCount = boxesRef.current.filter((b) => b.id !== DRAWING_ID).length;
    if (currentBoxCount > 0) {
      const ok = confirm(
        `Ảnh này đã có ${currentBoxCount} nhãn. Thêm ${prevAnnotations.length} nhãn từ ảnh trước vào?`,
      );
      if (!ok) return;
    }

    const copiedBoxes: Box[] = prevAnnotations.map((a) => ({
      id: a.id,
      class_id: a.class_id,
      type: (a.type === 'quad' ? 'quad' : 'bbox') as Box['type'],
      x: a.x, y: a.y, w: a.w, h: a.h,
      points: a.points,
    })).map((b) => ({
      ...b,
      id: `copy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }));
    const merged = [...boxesRef.current.filter((b) => b.id !== DRAWING_ID), ...copiedBoxes];
    pushHistorySnapshot();
    setBoxes(merged);
    scheduleSave(merged);
  }, [currentIndex, images, projectId, boxesRef, pushHistorySnapshot, setPrefillCount, setBoxes, scheduleSave, setCopyingLabels]);

  const copyImageToClipboard = useCallback(async () => {
    if (!projectId || !image) return;
    const imageUrl = `/uploads/${projectId}/${image.filename}`;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      let copyBlob = blob;
      if (blob.type !== 'image/png') {
        const img = new Image();
        img.src = imageUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (pngBlob) {
            copyBlob = pngBlob;
          }
        }
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          [copyBlob.type]: copyBlob
        })
      ]);
      alert('Đã copy ảnh vào clipboard!');
    } catch (err: any) {
      alert('Không thể copy ảnh: ' + err.message);
    }
  }, [projectId, image]);

  const handleDeleteImage = useCallback(async () => {
    if (!projectId || !imageId) return;
    if (!window.confirm('Bạn có chắc chắn muốn xoá ảnh này? Hành động này không thể hoàn tác.')) return;
    try {
      const { api } = await import('../../api');
      await api.deleteImage(projectId, imageId);

      const remainingImages = images.filter((img) => img.id !== imageId);
      removeImageFromList(imageId);

      if (remainingImages.length === 0) {
        navigate(`/projects/${projectId}`);
      } else {
        const nextIdx = currentIndex < remainingImages.length ? currentIndex : remainingImages.length - 1;
        const nextImage = remainingImages[nextIdx];
        if (nextImage) {
          navigate(`/projects/${projectId}/annotate/${nextImage.id}`);
        } else {
          navigate(`/projects/${projectId}`);
        }
      }
    } catch (err: any) {
      alert('Lỗi khi xoá ảnh: ' + err.message);
    }
  }, [projectId, imageId, images, currentIndex, navigate, removeImageFromList]);

  // Canvas drawing loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const el = imgEl;
    if (!canvas || !el || !image) return;
    const container = containerRef.current;
    const maxW = container ? container.clientWidth : image.width;
    const maxH = container ? container.clientHeight : image.height;
    const fitScale = Math.min(maxW / image.width, maxH / image.height, 1) || 1;
    const s = fitScale * zoom;
    setScale(s);
    canvas.width = image.width * s;
    canvas.height = image.height * s;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);

    // Roboflow Focus Spotlight Mode: Dim outer image canvas when hovering over a box
    const activeTargetId = hoveredId || (selectedId && selectedIds.size <= 1 ? selectedId : null);
    const hoveredBox = (spotlightEnabled && activeTargetId) ? boxes.find((b) => b.id === activeTargetId && b.id !== DRAWING_ID) : null;

    if (hoveredBox) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.beginPath();
      if ((hoveredBox.type === 'quad' || hoveredBox.type === 'sam_smart_polygon') && hoveredBox.points) {
        const pts = hoveredBox.points.map((p) => ({ x: p.x * s, y: p.y * s }));
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
      } else {
        ctx.rect(hoveredBox.x * s, hoveredBox.y * s, hoveredBox.w * s, hoveredBox.h * s);
      }
      ctx.clip();
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    for (const b of boxes) {
      const cls = classById.get(b.class_id);
      const color = cls?.color || '#F05922';
      const isPrimary = b.id === selectedId;
      const isMultiSelected = selectedIds.has(b.id);
      const isSelected = isPrimary || isMultiSelected;
      const showHandles = isSelected;

      if ((b.type === 'quad' || b.type === 'sam_smart_polygon') && b.points) {
        const pts = b.points.map((p) => ({ x: p.x * s, y: p.y * s }));
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = b.source === 'sam_smart_polygon' ? '#8b5cf6' : color;
        if (isMultiSelected && !isPrimary) ctx.setLineDash([6, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = b.source === 'sam_smart_polygon' ? 'rgba(139, 92, 246, 0.25)' : color + '33';
        ctx.fill();

        const labelName = b.source === 'sam_smart_polygon' ? `🟣 ${cls?.name || 'SAM'}` : (cls?.name || '?');
        drawLabel(ctx, labelName, b.source === 'sam_smart_polygon' ? '#8b5cf6' : color, pts[0].x, pts[0].y);

        if (showHandles) {
          ctx.fillStyle = color;
          for (const p of pts) ctx.fillRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        }
      } else {
        const bx = b.x * s, by = b.y * s, bw = b.w * s, bh = b.h * s;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = b.source === 'auto_prompt' ? '#3b82f6' : color;
        if (isMultiSelected && !isPrimary) ctx.setLineDash([6, 3]);
        if (b.source === 'auto_prompt') ctx.setLineDash([8, 4]); // Dashed line for auto generated
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);
        ctx.fillStyle = b.source === 'auto_prompt' ? 'rgba(59, 130, 246, 0.2)' : color + '33';
        ctx.fillRect(bx, by, bw, bh);

        const labelName = b.source === 'auto_prompt' ? `🤖 ${cls?.name || 'Auto'}` : (cls?.name || '?');
        drawLabel(ctx, labelName, b.source === 'auto_prompt' ? '#3b82f6' : color, bx, by);

        if (showHandles) {
          ctx.fillStyle = b.source === 'auto_prompt' ? '#3b82f6' : color;
          for (const [hx, hy] of [
            [bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh],
            [bx + bw / 2, by], [bx + bw / 2, by + bh], [bx, by + bh / 2], [bx + bw, by + bh / 2]
          ]) {
            ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
          }
        }
      }
    }

    if (selectRect) {
      const rx = Math.min(selectRect.x0, selectRect.x1) * s;
      const ry = Math.min(selectRect.y0, selectRect.y1) * s;
      const rw = Math.abs(selectRect.x1 - selectRect.x0) * s;
      const rh = Math.abs(selectRect.y1 - selectRect.y0) * s;
      ctx.save();
      ctx.strokeStyle = '#F05922';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(240, 89, 34, 0.12)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.restore();
    }

    if (drawingPoints.length > 0) {
      const color = classById.get(activeClassId)?.color || '#F05922';
      const pts = drawingPoints.map((p) => ({ x: p.x * s, y: p.y * s }));
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (mousePos) ctx.lineTo(mousePos.x * s, mousePos.y * s);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [boxes, image, imgEl, selectedId, selectedIds, hoveredId, spotlightEnabled, selectRect, classById, drawingPoints, mousePos, activeClassId, zoom]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  const toImageCoords = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((clientX - rect.left) / scale, 0, image?.width || 0),
      y: clamp((clientY - rect.top) / scale, 0, image?.height || 0),
    };
  };

  const hitTestHandle = (b: Box, x: number, y: number): Handle => {
    const tol = Math.max(HANDLE_SIZE, 8) / scale;
    if (b.type === 'quad' && b.points) {
      for (let i = 0; i < b.points.length; i++) {
        if (Math.abs(x - b.points[i].x) <= tol && Math.abs(y - b.points[i].y) <= tol) return i;
      }
      return null;
    }
    const corners: [Handle, number, number][] = [
      ['nw', b.x, b.y], ['ne', b.x + b.w, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.w, b.y + b.h],
      ['n', b.x + b.w / 2, b.y], ['s', b.x + b.w / 2, b.y + b.h], ['w', b.x, b.y + b.h / 2], ['e', b.x + b.w, b.y + b.h / 2],
    ];
    for (const [h, cx, cy] of corners) {
      if (Math.abs(x - cx) <= tol && Math.abs(y - cy) <= tol) return h;
    }

    return null;
  };

  const hitTestBox = (x: number, y: number): Box | null => {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      if (b.type === 'quad' && b.points) {
        if (pointInPolygon(x, y, b.points)) return b;
      } else if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        return b;
      }
    }
    return null;
  };

  const finalizeQuad = useCallback((points: Point[]) => {
    if (!activeClassId) return;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const box: Box = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      class_id: activeClassId,
      type: 'quad',
      x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0,
      points: points as [Point, Point, Point, Point],
    };
    updateBoxes((prev) => [...prev, box]);
    selectOnly(box.id);
  }, [activeClassId, selectOnly]);

  const detachWindowDragListeners = useCallback(() => {
    const { move, up } = windowListenersRef.current;
    if (move) window.removeEventListener('mousemove', move);
    if (up) window.removeEventListener('mouseup', up);
    windowListenersRef.current = {};
  }, []);

  const attachWindowDragListeners = () => {
    detachWindowDragListeners();
    const move = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY);
    const up = () => { handleDragUp(); detachWindowDragListeners(); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    windowListenersRef.current = { move, up };
  };

  useEffect(() => () => detachWindowDragListeners(), [detachWindowDragListeners]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (project?.label_type === 'classify' || project?.label_type === 'text_rec') {
      return;
    }
    if (spaceHeld || e.button === 1) {
      e.preventDefault();
      startPan(e);
      return;
    }
    const { x, y } = toImageCoords(e.clientX, e.clientY);

    if (drawingPoints.length > 0) {
      setDrawingPoints((prev) => {
        const next = [...prev, { x, y }];
        if (next.length === 4) { finalizeQuad(next); return []; }
        return next;
      });
      return;
    }

    if (selectedIds.size > 0 || selectedId) {
      const selectedBoxes = boxes.filter((b) => selectedIds.has(b.id) || b.id === selectedId);
      for (const sel of selectedBoxes) {
        const handle = hitTestHandle(sel, x, y);
        if (handle !== null) {
          preDragSnapshotRef.current = boxesRef.current.map(cloneBox);
          const isGroupResize = selectedIds.size > 1;
          dragRef.current = {
            mode: 'resize',
            handle,
            startX: x,
            startY: y,
            orig: cloneBox(sel),
            groupOrig: isGroupResize ? boxesRef.current.filter((b) => selectedIds.has(b.id) || b.id === selectedId).map(cloneBox) : undefined,
          };
          attachWindowDragListeners();
          return;
        }
      }
    }
    const hit = hitTestBox(x, y);
    const multiKey = e.shiftKey || e.ctrlKey || e.metaKey;
    const isRightClick = e.button === 2;

    if (isRightClick || (multiKey && !hit)) {
      e.preventDefault();
      if (!multiKey) {
        selectOnly(null);
      }
      dragRef.current = { mode: 'select', handle: null, startX: x, startY: y };
      selectRectRef.current = { x0: x, y0: y, x1: x, y1: y };
      setSelectRect(selectRectRef.current);
      attachWindowDragListeners();
      return;
    }

    if (hit) {
      if (multiKey) {
        toggleSelection(hit.id);
        return;
      }
      const isGroupDrag = selectedIds.size > 1 && selectedIds.has(hit.id);
      if (!isGroupDrag) selectOnly(hit.id);
      preDragSnapshotRef.current = boxesRef.current.map(cloneBox);
      dragRef.current = {
        mode: 'move', handle: null, startX: x, startY: y, orig: cloneBox(hit),
        groupOrig: isGroupDrag ? boxesRef.current.filter((b) => selectedIds.has(b.id)).map(cloneBox) : undefined,
      };
      attachWindowDragListeners();
      return;
    }

    selectOnly(null);
    if (!activeClassId) return;
    if (tool === 'sam_smart_polygon') {
      if (!projectId || !imageId || !image?.width || !image?.height) return;
      const normX = x / image.width;
      const normY = y / image.height;
      requestSamPolygon(projectId, imageId, [normX, normY])
        .then((res) => {
          if (res.success && res.polygon) {
            const polyPoints: Point[] = res.polygon.map((p) => ({
              x: Number((p.x * image.width).toFixed(2)),
              y: Number((p.y * image.height).toFixed(2)),
            }));
            const br = boundingRect(polyPoints as [Point, Point, Point, Point]);
            const newBox: Box = {
              id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              class_id: activeClassId,
              type: 'sam_smart_polygon',
              x: br.x,
              y: br.y,
              w: br.w,
              h: br.h,
              points: polyPoints,
              source: 'sam_smart_polygon',
            };
            setBoxes((prev) => [...prev, newBox]);
          }
        })
        .catch((err) => {
          console.error('[sam_polygon] Failed to generate polygon:', err);
        });
      return;
    }
    if (tool === 'quad') {
      setDrawingPoints([{ x, y }]);
      return;
    }
    preDragSnapshotRef.current = boxesRef.current.map(cloneBox);
    lastDrawnSizeRef.current = null;
    dragRef.current = { mode: 'draw', handle: null, startX: x, startY: y };
    attachWindowDragListeners();
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (project?.label_type === 'classify' || project?.label_type === 'text_rec') {
      if (canvasRef.current) canvasRef.current.style.cursor = 'default';
      return;
    }
    const pos = toImageCoords(e.clientX, e.clientY);
    lastMousePosRef.current = pos;
    if (dragRef.current.mode !== 'none') return;
    if (drawingPoints.length > 0 && drawingPoints.length < 4) {
      setMousePos(pos);
    }

    if (!spaceHeld && !isPanning && canvasRef.current) {
      let cursor = 'crosshair';
      const hit = hitTestBox(pos.x, pos.y);
      setHoveredId(hit ? hit.id : null);

      let handleFound: Handle = null;
      if (selectedIds.size > 0 || selectedId) {
        const selectedBoxes = boxes.filter((b) => selectedIds.has(b.id) || b.id === selectedId);
        for (const sel of selectedBoxes) {
          const h = hitTestHandle(sel, pos.x, pos.y);
          if (h !== null) {
            handleFound = h;
            break;
          }
        }
      }

      if (handleFound !== null) {
        cursor = typeof handleFound === 'number' ? 'pointer' : (HANDLE_CURSOR[handleFound] || 'pointer');
      } else if (hit) {
        cursor = 'move';
      }
      canvasRef.current.style.cursor = cursor;
    }
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    const { x, y } = toImageCoords(clientX, clientY);
    const drag = dragRef.current;
    if (drag.mode === 'none') return;
    const imageW = image?.width || 0;
    const imageH = image?.height || 0;

    if (drag.mode === 'draw') {
      const x0 = Math.min(drag.startX, x), y0 = Math.min(drag.startY, y);
      const w = Math.abs(x - drag.startX), h = Math.abs(y - drag.startY);
      lastDrawnSizeRef.current = { w, h };
      setBoxes((prev) => {
        const rest = prev.filter((b) => b.id !== DRAWING_ID);
        return [...rest, { id: DRAWING_ID, class_id: activeClassId, type: 'bbox', x: x0, y: y0, w, h }];
      });
    } else if (drag.mode === 'move' && drag.orig) {
      const targetId = drag.orig.id;
      let dx = x - drag.startX, dy = y - drag.startY;
      const orig = drag.orig;
      const w = imageW, h = imageH;

      if (drag.groupOrig && drag.groupOrig.length > 1) {
        let minDx = -Infinity, maxDx = Infinity, minDy = -Infinity, maxDy = Infinity;
        for (const b of drag.groupOrig) {
          minDx = Math.max(minDx, -b.x);
          maxDx = Math.min(maxDx, w - b.w - b.x);
          minDy = Math.max(minDy, -b.y);
          maxDy = Math.min(maxDy, h - b.h - b.y);
        }
        dx = clamp(dx, minDx, maxDx);
        dy = clamp(dy, minDy, maxDy);
        const groupOrig = drag.groupOrig;
        setBoxes((prev) => prev.map((b) => {
          const o = groupOrig.find((g) => g.id === b.id);
          if (!o) return b;
          if (o.type === 'quad' && o.points) {
            const newPoints = o.points.map((p) => ({ x: clamp(p.x + dx, 0, w), y: clamp(p.y + dy, 0, h) })) as [Point, Point, Point, Point];
            return { ...b, points: newPoints, ...boundingRect(newPoints) };
          }
          return { ...b, x: clamp(o.x + dx, 0, w - o.w), y: clamp(o.y + dy, 0, h - o.h) };
        }));
      } else if (orig.type === 'quad' && orig.points) {
        const newPoints = orig.points.map((p) => ({ x: clamp(p.x + dx, 0, w), y: clamp(p.y + dy, 0, h) })) as [Point, Point, Point, Point];
        setBoxes((prev) => prev.map((b) => (b.id === targetId ? { ...b, points: newPoints, ...boundingRect(newPoints) } : b)));
      } else {
        setBoxes((prev) => prev.map((b) => (b.id === targetId
          ? { ...b, x: clamp(orig.x + dx, 0, w - orig.w), y: clamp(orig.y + dy, 0, h - orig.h) }
          : b)));
      }
    } else if (drag.mode === 'select') {
      selectRectRef.current = { x0: drag.startX, y0: drag.startY, x1: x, y1: y };
      setSelectRect(selectRectRef.current);
    } else if (drag.mode === 'resize' && drag.orig) {
      const targetId = drag.orig.id;
      const orig = drag.orig;
      
      // 1. Calculate the new points/coordinates for the primary box first (as reference)
      let newPrimaryPoints: [Point, Point, Point, Point] | undefined = undefined;
      let pnx = orig.x, pny = orig.y, pnw = orig.w, pnh = orig.h;

      if (typeof drag.handle === 'number' && orig.points) {
        const newPoints = orig.points.map((p) => ({ ...p })) as [Point, Point, Point, Point];
        newPoints[drag.handle] = { x: clamp(x, 0, imageW), y: clamp(y, 0, imageH) };
        newPrimaryPoints = newPoints;
        const rect = boundingRect(newPoints);
        pnx = rect.x;
        pny = rect.y;
        pnw = rect.w;
        pnh = rect.h;
      } else {
        const clampedX = clamp(x, 0, imageW);
        const clampedY = clamp(y, 0, imageH);
        
        let x1 = orig.x;
        let y1 = orig.y;
        let x2 = orig.x + orig.w;
        let y2 = orig.y + orig.h;

        if (drag.handle === 'nw') { x1 = clampedX; y1 = clampedY; }
        else if (drag.handle === 'ne') { x2 = clampedX; y1 = clampedY; }
        else if (drag.handle === 'se') { x2 = clampedX; y2 = clampedY; }
        else if (drag.handle === 'sw') { x1 = clampedX; y2 = clampedY; }
        else if (drag.handle === 'n') { y1 = clampedY; }
        else if (drag.handle === 's') { y2 = clampedY; }
        else if (drag.handle === 'w') { x1 = clampedX; }
        else if (drag.handle === 'e') { x2 = clampedX; }

        pnx = Math.min(x1, x2);
        pny = Math.min(y1, y2);
        pnw = Math.max(Math.abs(x2 - x1), 2);
        pnh = Math.max(Math.abs(y2 - y1), 2);
      }

      // 2. Compute scale factors
      const scaleX = orig.w > 0 ? pnw / orig.w : 1;
      const scaleY = orig.h > 0 ? pnh / orig.h : 1;

      // 3. Apply resize/scale to all boxes in selection group
      if (drag.groupOrig && drag.groupOrig.length > 1) {
        const groupOrig = drag.groupOrig;
        setBoxes((prev) => prev.map((b) => {
          const o = groupOrig.find((g) => g.id === b.id);
          if (!o) return b;

          // For the primary box, use exact calculated primary dimensions
          if (b.id === targetId) {
            if (typeof drag.handle === 'number' && newPrimaryPoints) {
              return { ...b, points: newPrimaryPoints, ...boundingRect(newPrimaryPoints) };
            }
            return { ...b, x: pnx, y: pny, w: pnw, h: pnh };
          }

          // For other selected boxes, scale each box around its OWN corresponding anchor
          if (o.type === 'quad' && o.points && typeof drag.handle === 'number') {
            const oppIdx = (drag.handle + 2) % 4;
            const oAnchor = o.points[oppIdx];
            const newPoints = o.points.map((pt) => ({
              x: clamp(oAnchor.x + (pt.x - oAnchor.x) * scaleX, 0, imageW),
              y: clamp(oAnchor.y + (pt.y - oAnchor.y) * scaleY, 0, imageH),
            })) as [Point, Point, Point, Point];
            return { ...b, points: newPoints, ...boundingRect(newPoints) };
          } else {
            let rx = o.x;
            let ry = o.y;
            let rw = o.w;
            let rh = o.h;

            if (drag.handle === 'se') {
              rx = o.x; ry = o.y; rw = o.w * scaleX; rh = o.h * scaleY;
            } else if (drag.handle === 'nw') {
              rx = o.x + o.w - o.w * scaleX; ry = o.y + o.h - o.h * scaleY; rw = o.w * scaleX; rh = o.h * scaleY;
            } else if (drag.handle === 'ne') {
              rx = o.x; ry = o.y + o.h - o.h * scaleY; rw = o.w * scaleX; rh = o.h * scaleY;
            } else if (drag.handle === 'sw') {
              rx = o.x + o.w - o.w * scaleX; ry = o.y; rw = o.w * scaleX; rh = o.h * scaleY;
            } else if (drag.handle === 'n') {
              rx = o.x; ry = o.y + o.h - o.h * scaleY; rw = o.w; rh = o.h * scaleY;
            } else if (drag.handle === 's') {
              rx = o.x; ry = o.y; rw = o.w; rh = o.h * scaleY;
            } else if (drag.handle === 'w') {
              rx = o.x + o.w - o.w * scaleX; ry = o.y; rw = o.w * scaleX; rh = o.h;
            } else if (drag.handle === 'e') {
              rx = o.x; ry = o.y; rw = o.w * scaleX; rh = o.h;
            }

            rx = clamp(rx, 0, imageW - 2);
            ry = clamp(ry, 0, imageH - 2);
            rw = clamp(Math.max(rw, 2), 2, imageW - rx);
            rh = clamp(Math.max(rh, 2), 2, imageH - ry);

            return { ...b, x: rx, y: ry, w: rw, h: rh };
          }
        }));
      } else {
        // Single box resize
        if (typeof drag.handle === 'number' && newPrimaryPoints) {
          setBoxes((prev) => prev.map((b) => (b.id === targetId ? { ...b, points: newPrimaryPoints, ...boundingRect(newPrimaryPoints) } : b)));
        } else {
          setBoxes((prev) => prev.map((b) => (b.id === targetId ? { ...b, x: pnx, y: pny, w: pnw, h: pnh } : b)));
        }
      }
    }
  };

  const handleDragUp = () => {
    const drag = dragRef.current;
    if (drag.mode === 'draw') {
      const lastSize = lastDrawnSizeRef.current;
      const willFinalize = lastSize && lastSize.w > 3 && lastSize.h > 3;

      setBoxes((prev) => {
        const drawn = prev.find((b) => b.id === DRAWING_ID);
        const rest = prev.filter((b) => b.id !== DRAWING_ID);
        if (drawn && drawn.w > 3 && drawn.h > 3) {
          const finalized = { ...drawn, id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
          const next = [...rest, finalized];
          scheduleSave(next);
          setSelectedId(finalized.id);
          return next;
        }
        return rest;
      });

      if (willFinalize && preDragSnapshotRef.current) {
        pushHistorySnapshot(preDragSnapshotRef.current);
      }
      preDragSnapshotRef.current = null;
      lastDrawnSizeRef.current = null;
    } else if (drag.mode === 'move' || drag.mode === 'resize') {
      const changed = preDragSnapshotRef.current
        && JSON.stringify(preDragSnapshotRef.current) !== JSON.stringify(boxesRef.current);
      if (changed && preDragSnapshotRef.current) {
        pushHistorySnapshot(preDragSnapshotRef.current);
      }
      preDragSnapshotRef.current = null;
      if (changed) setBoxes((prev) => { scheduleSave(prev); return prev; });
    } else if (drag.mode === 'select') {
      const rect = selectRectRef.current;
      if (rect) {
        const rx0 = Math.min(rect.x0, rect.x1);
        const ry0 = Math.min(rect.y0, rect.y1);
        const rx1 = Math.max(rect.x0, rect.x1);
        const ry1 = Math.max(rect.y0, rect.y1);
        if (rx1 - rx0 > 3 || ry1 - ry0 > 3) {
          const inside = boxesRef.current.filter((b) => {
            const bx0 = b.x, by0 = b.y, bx1 = b.x + b.w, by1 = b.y + b.h;
            return bx0 < rx1 && bx1 > rx0 && by0 < ry1 && by1 > ry0;
          });
          if (inside.length > 0) {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              inside.forEach((b) => next.add(b.id));
              return next;
            });
            setSelectedId(inside[inside.length - 1].id);
          }
        }
      }
      selectRectRef.current = null;
      setSelectRect(null);
    }
    dragRef.current = { mode: 'none', handle: null, startX: 0, startY: 0 };
  };

  const deleteSelected = useCallback(() => {
    if (selectedIds.size > 1) {
      updateBoxes((prev) => prev.filter((b) => !selectedIds.has(b.id)));
      selectOnly(null);
      return;
    }
    if (!selectedId) return;
    updateBoxes((prev) => prev.filter((b) => b.id !== selectedId));
    selectOnly(null);
  }, [selectedId, selectedIds, selectOnly]);

  const clearAllBoxes = useCallback(() => {
    const currentBoxCount = boxesRef.current.filter((b) => b.id !== DRAWING_ID).length;
    if (currentBoxCount === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xoá toàn bộ ${currentBoxCount} nhãn trong hình này? (Có thể hoàn tác bằng Ctrl+Z)`)) return;
    pushHistorySnapshot();
    setPrefillCount(0);
    setBoxes([]);
    scheduleSave([]);
    selectOnly(null);
  }, [boxesRef, pushHistorySnapshot, setPrefillCount, setBoxes, scheduleSave, selectOnly]);

  const assignClassToSelected = useCallback((classId: string) => {
    setActiveClassId(classId);
    pushToMru(classId);
    if (selectedIds.size > 1) {
      updateBoxes((prev) => prev.map((b) => (selectedIds.has(b.id) ? { ...b, class_id: classId } : b)));
    } else if (selectedId) {
      updateBoxes((prev) => prev.map((b) => (b.id === selectedId ? { ...b, class_id: classId } : b)));
    }
  }, [selectedId, selectedIds, pushToMru, setActiveClassId]);

  const applySwitcherClass = useCallback((classId: string) => {
    assignClassToSelected(classId);
    setShowSwitcher(false);
    setSwitcherQuery('');
  }, [assignClassToSelected]);

  const handleSwitcherKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowSwitcher(false);
      setSwitcherQuery('');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSwitcherIdx((prev) => Math.min(prev + 1, switcherResults.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSwitcherIdx((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = switcherResults[switcherIdx];
      if (chosen) applySwitcherClass(chosen.id);
      return;
    }
  }, [switcherResults, switcherIdx, applySwitcherClass]);

  const undoLastPoint = useCallback(() => {
    setDrawingPoints((prev) => prev.slice(0, -1));
  }, []);

  const cancelDrawing = useCallback(() => setDrawingPoints([]), []);

  // Classification state & save helper
  const classifyImage = useCallback(async (classId: string) => {
    const newBox: Box = {
      id: `class_${Date.now()}`,
      class_id: classId,
      type: 'classify',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    };
    setBoxes([newBox]);
    scheduleSave([newBox]);

    if (!image?.completed_at) {
      await handleMarkDone();
    }

    await flushSave();

    const next = images[currentIndex + 1];
    if (next) {
      navigate(`/projects/${projectId}/annotate/${next.id}`);
    } else {
      alert('Đã gán nhãn xong ảnh cuối cùng của dự án. Quay lại trang chi tiết dự án.');
      navigate(`/projects/${projectId}`);
    }
  }, [setBoxes, scheduleSave, image, handleMarkDone, flushSave, images, currentIndex, navigate, projectId]);

  // Text recognition state & save helpers
  const [textValue, setTextValue] = useState('');
  useEffect(() => {
    if (project?.label_type === 'text_rec') {
      setTextValue(boxes[0]?.text_content || '');
    }
  }, [boxes, project?.label_type]);

  const saveTextRecognition = useCallback((val: string) => {
    const classId = activeClassId || classes[0]?.id;
    if (!classId) return;
    const newBox: Box = {
      id: boxes[0]?.id || `text_${Date.now()}`,
      class_id: classId,
      type: 'text_rec',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      text_content: val.trim(),
    };
    const newBoxes = val.trim() ? [newBox] : [];
    setBoxes(newBoxes);
    scheduleSave(newBoxes);
  }, [boxes, activeClassId, classes, setBoxes, scheduleSave]);

  const handleSaveAndNextText = async () => {
    saveTextRecognition(textValue);

    if (textValue.trim() && !image?.completed_at) {
      await handleMarkDone();
    }

    await flushSave();

    const next = images[currentIndex + 1];
    if (next) {
      navigate(`/projects/${projectId}/annotate/${next.id}`);
    } else {
      alert('Đã gán nhãn xong ảnh cuối cùng của dự án. Quay lại trang chi tiết dự án.');
      navigate(`/projects/${projectId}`);
    }
  };

  const handleTextEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveAndNextText();
    }
  };

  // Keyboard Shortcuts Hook
  useHotkeys({
    labelType: project?.label_type,
    selectedId,
    selectedIds,
    drawingPoints,
    mruClassIds,
    classes,
    image,
    clipboardBoxRef,
    setShowSwitcher,
    setSwitcherQuery,
    setSwitcherIdx,
    onUndo: undo,
    onRedo: redo,
    onUndoLastPoint: undoLastPoint,
    onCancelDrawing: cancelDrawing,
    onSelectOnly: selectOnly,
    onDeleteSelected: deleteSelected,
    onClearAllBoxes: clearAllBoxes,
    onCopySelectedBox: copySelectedBox,
    onPasteBox: pasteBox,
    onCopyLabelsFromPrev: copyLabelsFromPrev,
    onCopyImage: copyImageToClipboard,
    onDeleteImage: handleDeleteImage,
    onAssignClassToSelected: assignClassToSelected,
    onGoTo: goTo,
    onHandleMarkDone: handleMarkDone,
    onHandleUnmarkDone: handleUnmarkDone,
    onClassifyImage: classifyImage,
  });

  if (!image) return <p>Đang tải ảnh...</p>;

  return (
    <div>
      <AnnotatorToolbar
        projectId={projectId}
        currentIndex={currentIndex}
        totalImages={images.length}
        currentImage={image}
        prevImageItem={prevImageItem}
        tool={tool}
        selectedId={selectedId}
        hasClipboard={hasClipboard}
        undoSize={undoSize}
        redoSize={redoSize}
        copyingLabels={copyingLabels}
        zoom={zoom}
        showFilmstrip={showFilmstrip}
        saveState={saveState}
        doneBusy={doneBusy}
        reviewBusy={reviewBusy}
        canReview={canReview}
        onGoTo={goTo}
        onSetTool={setTool}
        onCancelDrawing={cancelDrawing}
        onCopySelectedBox={copySelectedBox}
        onPasteBox={pasteBox}
        onUndo={undo}
        onRedo={redo}
        onCopyLabelsFromPrev={copyLabelsFromPrev}
        onSetZoomClamped={setZoomClamped}
        onSetZoom={setZoom}
        onToggleFilmstrip={toggleFilmstrip}
        onHandleMarkDone={handleMarkDone}
        onHandleUnmarkDone={handleUnmarkDone}
        onSubmitReview={handleSubmitReview}
        onApproveReview={handleApprove}
        onRejectReview={handleReject}
        onOpenPromptModal={() => setShowPromptModal(true)}
        onOpenAutoLabel={() => setAutoLabelOpen(true)}
        onCopyImage={copyImageToClipboard}
        onDeleteImage={handleDeleteImage}
      />

      <PrefillBanner
        prefillLoading={prefillLoading}
        prefillCount={prefillCount}
        onClearSuggestions={updateBoxes}
      />

      <QuadHintBanner
        tool={tool}
        drawingPoints={drawingPoints}
        onUndoLastPoint={undoLastPoint}
        onCancelDrawing={cancelDrawing}
      />

      <div
        className="annotator-layout"
        style={{
          gridTemplateColumns: (project?.label_type === 'classify' || project?.label_type === 'text_rec')
            ? '1fr 320px'
            : undefined,
          height: showFilmstrip ? 'calc(100vh - 246px)' : undefined
        }}
      >
        {project?.label_type !== 'classify' && project?.label_type !== 'text_rec' && (
          <ClassPickerPanel
            classes={classes}
            boxes={boxes}
            selectedId={selectedId}
            selectedIds={selectedIds}
            activeClassId={activeClassId}
            mruClassIds={mruClassIds}
            onAssignClassToSelected={assignClassToSelected}
          />
        )}

        <AnnotatorCanvas
          spaceHeld={spaceHeld}
          isPanning={isPanning}
          imgEl={imgEl}
          containerRef={containerRef}
          canvasRef={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={(e) => {
             onMouseMove(e);
             if (spotlightEnabled) {
               // Logic to detect box under cursor to setHoveredId
             }
          }}
          onMouseLeave={() => setHoveredId(null)}
          onContextMenu={(e) => { e.preventDefault(); if (drawingPoints.length > 0) undoLastPoint(); }}
        />

        {project?.label_type !== 'classify' && project?.label_type !== 'text_rec' && (
          <AnnotationListPanel
            boxes={boxes}
            classById={classById}
            selectedId={selectedId}
            selectedIds={selectedIds}
            hoveredId={hoveredId}
            onSelectOnly={selectOnly}
            onUpdateBoxes={updateBoxes}
            onClearAllBoxes={clearAllBoxes}
            onHoverBox={setHoveredId}
          />
        )}

        {project?.label_type === 'classify' && (
          <div
            className="classify-panel card"
            style={{
              padding: '24px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-light)' }}>Chọn phân loại</h3>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Bấm nút hoặc gõ phím tắt tương ứng để phân loại ảnh và tự động chuyển sang ảnh tiếp theo.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
              {classes.map((cls) => {
                const isSelected = boxes[0]?.class_id === cls.id;
                return (
                  <button
                    key={cls.id}
                    onClick={() => classifyImage(cls.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      borderRadius: '8px',
                      border: isSelected ? `2px solid ${cls.color}` : '1px solid var(--border-color)',
                      background: isSelected ? `${cls.color}15` : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontWeight: isSelected ? 'bold' : 'normal',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: cls.color }} />
                      <span style={{ fontSize: '14px' }}>{cls.name}</span>
                    </div>
                    {cls.hotkey && (
                      <span style={{ fontSize: '11px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '3px 8px', borderRadius: '4px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                        {cls.hotkey.toUpperCase()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {project?.label_type === 'text_rec' && (
          <div
            className="text-rec-panel card"
            style={{
              padding: '24px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              height: '100%',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-light)' }}>Nhận diện chữ</h3>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Nhập nội dung văn bản (biển số xe, v.v.) của ảnh này. Nhấn <b>Enter</b> để Lưu &amp; Tiếp tục.
            </p>
            <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text-primary)' }}>Nội dung văn bản</label>
              <input
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={handleTextEnter}
                onBlur={() => saveTextRecognition(textValue)}
                placeholder="Gõ nội dung..."
                autoFocus
                style={{
                  padding: '14px 16px',
                  fontSize: '16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  width: '100%',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                }}
              />
            </div>
            <div style={{ marginTop: 'auto' }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveAndNextText}
                style={{ width: '100%', padding: '14px', fontSize: '14px', fontWeight: 'bold', borderRadius: '8px' }}
              >
                Lưu &amp; Tiếp tục →
              </button>
            </div>
          </div>
        )}
      </div>

      <QuickClassSwitcherModal
        showSwitcher={showSwitcher}
        switcherQuery={switcherQuery}
        switcherIdx={switcherIdx}
        switcherResults={switcherResults}
        mruClassIds={mruClassIds}
        switcherInputRef={switcherInputRef}
        onClose={() => { setShowSwitcher(false); setSwitcherQuery(''); }}
        onQueryChange={(q) => { setSwitcherQuery(q); setSwitcherIdx(0); }}
        onIdxChange={setSwitcherIdx}
        onKeyDown={handleSwitcherKey}
        onApplyClass={applySwitcherClass}
      />

      <FilmstripBar
        showFilmstrip={showFilmstrip}
        filmstripRef={filmstripRef}
        images={images}
        currentImageId={imageId}
        onGoToImageId={goToImageId}
      />
      {showPromptModal && (
        <div className="modal-backdrop" onClick={() => setShowPromptModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <h3 style={{ marginTop: 0 }}>💬 Grounding DINO Prompt Auto-Labeling</h3>
            <p style={{ fontSize: 13, color: '#888' }}>
              Nhập từ khóa mô tả đối tượng để AI tự động quét và gán nhãn cho toàn bộ ảnh chưa gán nhãn trong dự án.
            </p>
            <div style={{ margin: '15px 0' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Text Prompt (VD: car, license plate, person):</label>
              <input
                type="text"
                className="form-control"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Nhập tên đối tượng..."
                style={{ width: '100%', padding: '8px 12px', fontSize: 14 }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setShowPromptModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleRunPromptAutoLabel} disabled={promptBusy}>
                {promptBusy ? 'Đang tự động gán nhãn...' : '⚡ Khởi Chạy Auto-Label'}
              </button>
            </div>
          </div>
        </div>
      )}
      {autoLabelOpen && project && image && (
        <AutoLabelModal
          projectId={project.id}
          selectedImageIds={new Set([image.id])}
          onClose={() => setAutoLabelOpen(false)}
          onFinished={() => window.location.reload()}
        />
      )}
    </div>
  );
}

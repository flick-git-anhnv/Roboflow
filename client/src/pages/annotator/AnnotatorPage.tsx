import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCurrentUser, requestSamPolygon } from '../../api';
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

import useAnnotatorData from './hooks/useAnnotatorData';
import useUndoRedo from './hooks/useUndoRedo';
import useZoomPan from './hooks/useZoomPan';
import useClipboard from './hooks/useClipboard';
import useHotkeys from './hooks/useHotkeys';

const DRAWING_ID = '__drawing__';
const HANDLE_CURSOR: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };

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
    if (!projectId || !image) return;
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
      const showHandles = isPrimary;

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
        ctx.strokeStyle = color;
        if (isMultiSelected && !isPrimary) ctx.setLineDash([6, 3]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);
        ctx.fillStyle = color + '33';
        ctx.fillRect(bx, by, bw, bh);

        drawLabel(ctx, cls?.name || '?', color, bx, by);

        if (showHandles) {
          ctx.fillStyle = color;
          for (const [hx, hy] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) {
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
  }, [boxes, image, imgEl, selectedId, selectedIds, selectRect, classById, drawingPoints, mousePos, activeClassId, zoom]);

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
    const tol = HANDLE_SIZE / scale;
    if (b.type === 'quad' && b.points) {
      for (let i = 0; i < b.points.length; i++) {
        if (Math.abs(x - b.points[i].x) <= tol && Math.abs(y - b.points[i].y) <= tol) return i;
      }
      return null;
    }
    const corners: [Handle, number, number][] = [
      ['nw', b.x, b.y], ['ne', b.x + b.w, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.w, b.y + b.h],
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

    if (selectedId) {
      const sel = boxes.find((b) => b.id === selectedId);
      if (sel) {
        const handle = hitTestHandle(sel, x, y);
        if (handle !== null) {
          preDragSnapshotRef.current = boxesRef.current.map(cloneBox);
          const isGroupResize = selectedIds.size > 1 && selectedIds.has(sel.id);
          dragRef.current = {
            mode: 'resize',
            handle,
            startX: x,
            startY: y,
            orig: cloneBox(sel),
            groupOrig: isGroupResize ? boxesRef.current.filter((b) => selectedIds.has(b.id)).map(cloneBox) : undefined,
          };
          attachWindowDragListeners();
          return;
        }
      }
    }
    const hit = hitTestBox(x, y);
    const multiKey = e.shiftKey || e.ctrlKey || e.metaKey;

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

    if (multiKey) {
      dragRef.current = { mode: 'select', handle: null, startX: x, startY: y };
      selectRectRef.current = { x0: x, y0: y, x1: x, y1: y };
      setSelectRect(selectRectRef.current);
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

      const sel = selectedId ? boxes.find((b) => b.id === selectedId) : null;
      if (sel) {
        const handle = hitTestHandle(sel, pos.x, pos.y);
        if (handle !== null) {
          cursor = typeof handle === 'number' ? 'pointer' : (HANDLE_CURSOR[handle] || 'pointer');
        } else if (hit) {
          cursor = 'move';
        }
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
            const newPoints = o.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) as [Point, Point, Point, Point];
            return { ...b, points: newPoints, ...boundingRect(newPoints) };
          }
          return { ...b, x: o.x + dx, y: o.y + dy };
        }));
      } else if (orig.type === 'quad' && orig.points) {
        const newPoints = orig.points.map((p) => ({ x: clamp(p.x + dx, 0, w), y: clamp(p.y + dy, 0, h) })) as [Point, Point, Point, Point];
        setBoxes((prev) => prev.map((b) => (b.id === targetId ? { ...b, points: newPoints, ...boundingRect(newPoints) } : b)));
      } else {
        setBoxes((prev) => prev.map((b) => (b.id === targetId
          ? { ...b, x: clamp(orig.x + dx, 0, w - b.w), y: clamp(orig.y + dy, 0, h - b.h) }
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
        newPoints[drag.handle] = { x, y };
        newPrimaryPoints = newPoints;
        const rect = boundingRect(newPoints);
        pnx = rect.x;
        pny = rect.y;
        pnw = rect.w;
        pnh = rect.h;
      } else {
        if (drag.handle === 'se') { pnw = x - orig.x; pnh = y - orig.y; }
        else if (drag.handle === 'ne') { pnw = x - orig.x; pnh = orig.y + orig.h - y; pny = y; }
        else if (drag.handle === 'sw') { pnw = orig.x + orig.w - x; pnh = y - orig.y; pnx = x; }
        else if (drag.handle === 'nw') { pnw = orig.x + orig.w - x; pnh = orig.y + orig.h - y; pnx = x; pny = y; }
        if (pnw < 0) { pnx += pnw; pnw = -pnw; }
        if (pnh < 0) { pny += pnh; pny = -pnh; }
      }

      // 2. Compute scale factors and anchor point
      const scaleX = orig.w > 0 ? pnw / orig.w : 1;
      const scaleY = orig.h > 0 ? pnh / orig.h : 1;

      let ax = orig.x;
      let ay = orig.y;
      if (typeof drag.handle === 'number' && orig.points) {
        const oppIdx = (drag.handle + 2) % 4;
        ax = orig.points[oppIdx].x;
        ay = orig.points[oppIdx].y;
      } else {
        if (drag.handle === 'se') { ax = orig.x; ay = orig.y; }
        else if (drag.handle === 'ne') { ax = orig.x; ay = orig.y + orig.h; }
        else if (drag.handle === 'sw') { ax = orig.x + orig.w; ay = orig.y; }
        else if (drag.handle === 'nw') { ax = orig.x + orig.w; ay = orig.y + orig.h; }
      }

      // 3. Apply resize/scale to all boxes in selection group
      if (drag.groupOrig && drag.groupOrig.length > 1) {
        const groupOrig = drag.groupOrig;
        setBoxes((prev) => prev.map((b) => {
          const o = groupOrig.find((g) => g.id === b.id);
          if (!o) return b;

          if (o.type === 'quad' && o.points) {
            const newPoints = o.points.map((pt) => {
              const rx = ax + (pt.x - ax) * scaleX;
              const ry = ay + (pt.y - ay) * scaleY;
              return {
                x: clamp(rx, 0, imageW),
                y: clamp(ry, 0, imageH)
              };
            }) as [Point, Point, Point, Point];
            return { ...b, points: newPoints, ...boundingRect(newPoints) };
          } else {
            const nx1 = ax + (o.x - ax) * scaleX;
            const nx2 = ax + (o.x + o.w - ax) * scaleX;
            const ny1 = ay + (o.y - ay) * scaleY;
            const ny2 = ay + (o.y + o.h - ay) * scaleY;

            const rx = clamp(Math.min(nx1, nx2), 0, imageW);
            const ry = clamp(Math.min(ny1, ny2), 0, imageH);
            const rw = clamp(Math.max(nx1, nx2), 0, imageW) - rx;
            const rh = clamp(Math.max(ny1, ny2), 0, imageH) - ry;

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
    onCopySelectedBox: copySelectedBox,
    onPasteBox: pasteBox,
    onCopyLabelsFromPrev: copyLabelsFromPrev,
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
    </div>
  );
}

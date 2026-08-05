import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getCurrentUser } from '../api';
import type { Annotation, ClassLabel, ImageItem, ImageWithAnnotations, Point } from '../types';

const REVIEW_LABEL: Record<string, string> = {
  draft: 'Nháp',
  in_review: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
};

interface Box {
  id: string;
  class_id: string;
  type: 'bbox' | 'quad';
  x: number; y: number; w: number; h: number; // bounding rect (image pixel coordinates), always kept in sync
  points?: [Point, Point, Point, Point]; // present only for type === 'quad'
}

type Tool = 'bbox' | 'quad';
type DragMode = 'none' | 'draw' | 'move' | 'resize';
type Handle = 'nw' | 'ne' | 'sw' | 'se' | number | null;

const HANDLE_SIZE = 8;
const DRAWING_ID = '__drawing__';

export default function AnnotatorPage() {
  const { projectId, imageId } = useParams<{ projectId: string; imageId: string }>();
  const navigate = useNavigate();

  const [classes, setClasses] = useState<ClassLabel[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [image, setImage] = useState<ImageWithAnnotations | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [activeClassId, setActiveClassId] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [reviewBusy, setReviewBusy] = useState(false);
  const currentUser = getCurrentUser();
  const canReview = currentUser?.role === 'reviewer' || currentUser?.role === 'admin';
  const [tool, setTool] = useState<Tool>('bbox');
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);

  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: DragMode; handle: Handle; startX: number; startY: number; orig?: Box }>({
    mode: 'none', handle: null, startX: 0, startY: 0,
  });
  const windowListenersRef = useRef<{ move?: (e: MouseEvent) => void; up?: () => void }>({});
  const [scale, setScale] = useState(1);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [zoom, setZoom] = useState(1);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api.listClasses(projectId).then((cs) => {
      setClasses(cs);
      setActiveClassId((prev) => prev || cs[0]?.id || '');
    });
    api.listImages(projectId).then(setImages);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !imageId) return;
    setImgEl(null);
    api.getImage(projectId, imageId).then((img) => {
      setImage(img);
      setBoxes(img.annotations.map((a: Annotation) => annotationToBox(a)));
      setSelectedId(null);
      setDrawingPoints([]);
      setSaveState('saved');
      setZoom(1);
      const el = new window.Image();
      el.onload = () => setImgEl(el);
      el.src = `/uploads/${projectId}/${img.filename}`;
    });
  }, [projectId, imageId]);

  const currentIndex = useMemo(() => images.findIndex((i) => i.id === imageId), [images, imageId]);

  const goTo = useCallback((delta: number) => {
    const next = images[currentIndex + delta];
    if (next) navigate(`/projects/${projectId}/annotate/${next.id}`);
  }, [images, currentIndex, navigate, projectId]);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  // ── Review workflow (STEP-2.3) ────────────────────────────────────────────────
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

  const scheduleSave = useCallback((nextBoxes: Box[]) => {
    setSaveState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!imageId) return;
      setSaveState('saving');
      await api.saveAnnotations(imageId, nextBoxes.map((b) => ({
        class_id: b.class_id, x: b.x, y: b.y, w: b.w, h: b.h,
        type: b.type, points: b.type === 'quad' && b.points ? b.points : null,
      })));
      setSaveState('saved');
      setImages((imgs) => imgs.map((i) => (i.id === imageId ? { ...i, status: nextBoxes.length ? 'labeled' : 'unlabeled' } : i)));
    }, 600);
  }, [imageId]);

  const updateBoxes = (updater: (prev: Box[]) => Box[]) => {
    setBoxes((prev) => {
      const next = updater(prev);
      scheduleSave(next);
      return next;
    });
  };

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

    for (const b of boxes) {
      const cls = classById.get(b.class_id);
      const color = cls?.color || '#F05922';
      const isSelected = b.id === selectedId;

      if (b.type === 'quad' && b.points) {
        const pts = b.points.map((p) => ({ x: p.x * s, y: p.y * s }));
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.fillStyle = color + '33';
        ctx.fill();

        drawLabel(ctx, cls?.name || '?', color, pts[0].x, pts[0].y);

        if (isSelected) {
          ctx.fillStyle = color;
          for (const p of pts) ctx.fillRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        }
      } else {
        const bx = b.x * s, by = b.y * s, bw = b.w * s, bh = b.h * s;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = color;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = color + '33';
        ctx.fillRect(bx, by, bw, bh);

        drawLabel(ctx, cls?.name || '?', color, bx, by);

        if (isSelected) {
          ctx.fillStyle = color;
          for (const [hx, hy] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) {
            ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
          }
        }
      }
    }

    // Preview of the quad currently being placed by clicking
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
  }, [boxes, image, imgEl, selectedId, classById, drawingPoints, mousePos, activeClassId, zoom]);

  useEffect(() => { draw(); }, [draw]);

  // Runs after draw() has resized the canvas for the new zoom level, so the
  // scroll position it computed (to keep the point under the cursor fixed) is
  // applied against the correct, up-to-date canvas size.
  useEffect(() => {
    if (pendingScrollRef.current && containerRef.current) {
      containerRef.current.scrollLeft = pendingScrollRef.current.left;
      containerRef.current.scrollTop = pendingScrollRef.current.top;
      pendingScrollRef.current = null;
    }
  }, [zoom]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setSpaceHeld(true); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceHeld(false); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const setZoomClamped = (z: number) => setZoom(clamp(z, 1, 8));

  const onWheelZoom = (e: React.WheelEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const contentX = e.clientX - rect.left + container.scrollLeft;
    const contentY = e.clientY - rect.top + container.scrollTop;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = clamp(zoom * factor, 1, 8);
    if (newZoom === zoom) return;
    const ratio = newZoom / zoom;
    pendingScrollRef.current = {
      left: contentX * ratio - (e.clientX - rect.left),
      top: contentY * ratio - (e.clientY - rect.top),
    };
    setZoom(newZoom);
  };

  const startPan = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const startScrollLeft = container.scrollLeft, startScrollTop = container.scrollTop;
    const startClientX = e.clientX, startClientY = e.clientY;
    setIsPanning(true);
    const move = (ev: MouseEvent) => {
      container.scrollLeft = startScrollLeft - (ev.clientX - startClientX);
      container.scrollTop = startScrollTop - (ev.clientY - startClientY);
    };
    const up = () => {
      setIsPanning(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

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
    setSelectedId(box.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClassId]);

  const detachWindowDragListeners = useCallback(() => {
    const { move, up } = windowListenersRef.current;
    if (move) window.removeEventListener('mousemove', move);
    if (up) window.removeEventListener('mouseup', up);
    windowListenersRef.current = {};
  }, []);

  // Drag/resize/draw keep tracking the mouse via window listeners even if the
  // cursor leaves the canvas, so the shape clamps cleanly at the image edge
  // instead of freezing wherever the pointer last was inside the canvas.
  // Intentionally NOT wrapped in useCallback: it must close over the current
  // render's handleDragMove/handleDragUp (which read live state), not a stale one.
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
          dragRef.current = { mode: 'resize', handle, startX: x, startY: y, orig: cloneBox(sel) };
          attachWindowDragListeners();
          return;
        }
      }
    }
    const hit = hitTestBox(x, y);
    if (hit) {
      setSelectedId(hit.id);
      dragRef.current = { mode: 'move', handle: null, startX: x, startY: y, orig: cloneBox(hit) };
      attachWindowDragListeners();
      return;
    }
    if (!activeClassId) return;
    setSelectedId(null);
    if (tool === 'quad') {
      setDrawingPoints([{ x, y }]);
      return;
    }
    dragRef.current = { mode: 'draw', handle: null, startX: x, startY: y };
    attachWindowDragListeners();
  };

  const onMouseMove = (e: React.MouseEvent) => {
    // While actively dragging, window-level listeners (attached on mousedown)
    // handle movement so it keeps working outside the canvas bounds.
    if (dragRef.current.mode !== 'none') return;
    const { x, y } = toImageCoords(e.clientX, e.clientY);
    if (drawingPoints.length > 0 && drawingPoints.length < 4) {
      setMousePos({ x, y });
    }
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    const { x, y } = toImageCoords(clientX, clientY);
    const drag = dragRef.current;
    if (drag.mode === 'none') return;

    if (drag.mode === 'draw') {
      const x0 = Math.min(drag.startX, x), y0 = Math.min(drag.startY, y);
      const w = Math.abs(x - drag.startX), h = Math.abs(y - drag.startY);
      setBoxes((prev) => {
        const rest = prev.filter((b) => b.id !== DRAWING_ID);
        return [...rest, { id: DRAWING_ID, class_id: activeClassId, type: 'bbox', x: x0, y: y0, w, h }];
      });
    } else if (drag.mode === 'move' && drag.orig && selectedId) {
      const dx = x - drag.startX, dy = y - drag.startY;
      const orig = drag.orig;
      if (orig.type === 'quad' && orig.points) {
        const w = image?.width || 0, h = image?.height || 0;
        const newPoints = orig.points.map((p) => ({ x: clamp(p.x + dx, 0, w), y: clamp(p.y + dy, 0, h) })) as [Point, Point, Point, Point];
        setBoxes((prev) => prev.map((b) => (b.id === selectedId ? { ...b, points: newPoints, ...boundingRect(newPoints) } : b)));
      } else {
        setBoxes((prev) => prev.map((b) => (b.id === selectedId
          ? { ...b, x: clamp(orig.x + dx, 0, (image?.width || 0) - b.w), y: clamp(orig.y + dy, 0, (image?.height || 0) - b.h) }
          : b)));
      }
    } else if (drag.mode === 'resize' && drag.orig && selectedId) {
      const orig = drag.orig;
      if (typeof drag.handle === 'number' && orig.points) {
        const newPoints = orig.points.map((p) => ({ ...p })) as [Point, Point, Point, Point];
        newPoints[drag.handle] = { x, y };
        setBoxes((prev) => prev.map((b) => (b.id === selectedId ? { ...b, points: newPoints, ...boundingRect(newPoints) } : b)));
      } else {
        let nx = orig.x, ny = orig.y, nw = orig.w, nh = orig.h;
        if (drag.handle === 'se') { nw = x - orig.x; nh = y - orig.y; }
        if (drag.handle === 'ne') { nw = x - orig.x; nh = orig.y + orig.h - y; ny = y; }
        if (drag.handle === 'sw') { nw = orig.x + orig.w - x; nh = y - orig.y; nx = x; }
        if (drag.handle === 'nw') { nw = orig.x + orig.w - x; nh = orig.y + orig.h - y; nx = x; ny = y; }
        if (nw < 0) { nx += nw; nw = -nw; }
        if (nh < 0) { ny += nh; nh = -nh; }
        setBoxes((prev) => prev.map((b) => (b.id === selectedId ? { ...b, x: nx, y: ny, w: nw, h: nh } : b)));
      }
    }
  };

  const handleDragUp = () => {
    const drag = dragRef.current;
    if (drag.mode === 'draw') {
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
    } else if (drag.mode === 'move' || drag.mode === 'resize') {
      setBoxes((prev) => { scheduleSave(prev); return prev; });
    }
    dragRef.current = { mode: 'none', handle: null, startX: 0, startY: 0 };
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    updateBoxes((prev) => prev.filter((b) => b.id !== selectedId));
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const assignClassToSelected = useCallback((classId: string) => {
    setActiveClassId(classId);
    if (selectedId) {
      updateBoxes((prev) => prev.map((b) => (b.id === selectedId ? { ...b, class_id: classId } : b)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const undoLastPoint = useCallback(() => {
    setDrawingPoints((prev) => prev.slice(0, -1));
  }, []);

  const cancelDrawing = useCallback(() => setDrawingPoints([]), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape' && drawingPoints.length > 0) { cancelDrawing(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && drawingPoints.length > 0) {
        e.preventDefault();
        undoLastPoint();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const idx = classes.findIndex((c, i) => {
          const key = effectiveHotkey(c, i);
          return key !== null && key.toLowerCase() === e.key.toLowerCase();
        });
        if (idx >= 0) assignClassToSelected(classes[idx].id);
      }
      if (e.key === 'ArrowRight') goTo(1);
      if (e.key === 'ArrowLeft') goTo(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, deleteSelected, classes, goTo, drawingPoints, cancelDrawing, undoLastPoint, assignClassToSelected]);

  if (!image) return <p>Đang tải ảnh...</p>;

  return (
    <div>
      <div className="annotator-toolbar">
        <Link to={`/projects/${projectId}`} className="btn btn-outline">← Quay lại project</Link>
        <button className="btn btn-outline" onClick={() => goTo(-1)} disabled={currentIndex <= 0}>‹ Ảnh trước</button>
        <button className="btn btn-outline" onClick={() => goTo(1)} disabled={currentIndex < 0 || currentIndex >= images.length - 1}>Ảnh sau ›</button>

        <div className="tool-toggle">
          <button className={`tool-btn ${tool === 'bbox' ? 'active' : ''}`}
            onClick={() => { setTool('bbox'); setDrawingPoints([]); }} title="Kéo thả để vẽ khung chữ nhật">
            ▭ Kéo thả (Box)
          </button>
          <button className={`tool-btn ${tool === 'quad' ? 'active' : ''}`}
            onClick={() => setTool('quad')} title="Chấm 4 điểm — phù hợp cho biển số bị xiên/nghiêng">
            ◈ Chấm 4 điểm (Quad)
          </button>
        </div>

        <div className="zoom-controls">
          <button className="btn btn-outline" onClick={() => setZoomClamped(zoom / 1.25)} disabled={zoom <= 1} title="Thu nhỏ">−</button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button className="btn btn-outline" onClick={() => setZoomClamped(zoom * 1.25)} disabled={zoom >= 8} title="Phóng to">+</button>
          <button className="btn btn-outline" onClick={() => setZoom(1)} disabled={zoom === 1} title="Về vừa khung hình">⤢ Fit</button>
        </div>

        <span style={{ fontSize: 13, color: '#666' }}>{currentIndex + 1} / {images.length} — {image.original_name}</span>
        <span className={`save-status ${saveState}`}>
          {saveState === 'saved' ? '✓ Đã lưu' : saveState === 'saving' ? 'Đang lưu...' : 'Chưa lưu...'}
        </span>

        <div className="review-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {image.review_status && image.review_status !== 'draft' && (
            <span style={{
              fontSize: 12, padding: '3px 8px', borderRadius: 4, color: '#fff',
              background: image.review_status === 'approved' ? '#2e7d32' :
                image.review_status === 'rejected' ? '#F05922' : '#4A3F8C',
            }}
              title={image.review_comment || ''}>
              {REVIEW_LABEL[image.review_status]}
            </span>
          )}
          {!canReview && (!image.review_status || image.review_status === 'draft' || image.review_status === 'rejected') && (
            <button className="btn btn-outline" disabled={reviewBusy} onClick={handleSubmitReview}>
              📤 Gửi duyệt
            </button>
          )}
          {canReview && image.review_status === 'in_review' && (
            <>
              <button className="btn btn-outline" disabled={reviewBusy} onClick={handleApprove}>✓ Duyệt</button>
              <button className="btn btn-outline" disabled={reviewBusy} onClick={handleReject}>✕ Từ chối</button>
            </>
          )}
        </div>
      </div>

      {tool === 'quad' && (
        <div className="hint-text">
          <span>
            {drawingPoints.length === 0
              ? 'Bấm 4 điểm lần lượt quanh vật thể (theo chiều bất kỳ) để tạo khung 4 điểm.'
              : `Đã đặt ${drawingPoints.length}/4 điểm — bấm tiếp điểm thứ ${drawingPoints.length + 1}... (chuột phải để xoá điểm vừa chấm)`}
          </span>
          {drawingPoints.length > 0 && (
            <span className="hint-actions">
              <button className="btn btn-outline" onClick={undoLastPoint}>↩ Xoá điểm cuối</button>
              <button className="btn btn-outline" onClick={cancelDrawing}>✕ Huỷ (Esc)</button>
            </span>
          )}
        </div>
      )}

      <div className="annotator-layout">
        <div className="side-panel" style={{ position: 'static' }}>
          <div>
            <h4>{selectedId ? 'Đổi nhãn khung đã chọn' : 'Chọn nhãn (bấm phím tắt)'}</h4>
            <div className="class-list-scroll">
              {classes.map((c, idx) => {
                const highlighted = selectedId
                  ? boxes.find((b) => b.id === selectedId)?.class_id === c.id
                  : activeClassId === c.id;
                const key = effectiveHotkey(c, idx);
                return (
                  <div key={c.id} className={`class-picker-row ${highlighted ? 'active' : ''}`}
                    onClick={() => assignClassToSelected(c.id)}>
                    <span className="swatch" style={{ background: c.color }} />
                    <span>{c.name}</span>
                    <span className={`key ${c.hotkey ? 'custom' : ''}`}>{key || ''}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11.5, color: '#888', margin: '4px 0 0' }}>
              Vào trang project để đổi phím tắt cho từng nhãn (ô nhỏ cạnh tên nhãn).
            </p>
            {classes.length === 0 && <p style={{ fontSize: 12.5, color: '#888' }}>Chưa có nhãn nào. Quay lại project để thêm nhãn.</p>}
          </div>
          <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
            <b>Box:</b> kéo chuột để vẽ khung chữ nhật.<br />
            <b>Quad:</b> bấm lần lượt 4 điểm quanh vật xiên/nghiêng.<br />
            Chọn khung để di chuyển / kéo từng điểm góc, hoặc bấm nhãn khác/phím số để đổi nhãn. Delete để xoá khung đã chọn.<br />
            <b>Zoom:</b> lăn chuột hoặc nút +/− trên ảnh. <b>Pan:</b> giữ phím Space rồi kéo (hoặc kéo bằng chuột giữa).
          </p>
        </div>

        <div className={`canvas-stage ${spaceHeld ? 'pan-ready' : ''} ${isPanning ? 'panning' : ''}`}
          ref={containerRef} onWheel={onWheelZoom}>
          {!imgEl && <span className="canvas-loading">Đang tải ảnh...</span>}
          <canvas ref={canvasRef}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove}
            onContextMenu={(e) => { e.preventDefault(); if (drawingPoints.length > 0) undoLastPoint(); }} />
        </div>

        <div className="side-panel" style={{ position: 'static' }}>
          <h4>Annotations ({boxes.filter((b) => b.id !== DRAWING_ID).length})</h4>
          <div className="class-list-scroll">
            {boxes.filter((b) => b.id !== DRAWING_ID).map((b) => {
              const cls = classById.get(b.class_id);
              return (
                <div key={b.id} className="annotation-list-row"
                  onClick={() => setSelectedId(b.id)}
                  style={{ outline: selectedId === b.id ? `1px solid ${cls?.color}` : 'none' }}>
                  <span className="swatch" style={{ background: cls?.color }} />
                  <span>{cls?.name}</span>
                  <span className="shape-tag">{b.type === 'quad' ? '◈ 4 điểm' : '▭ box'}</span>
                  <button onClick={(e) => { e.stopPropagation(); setSelectedId(b.id); deleteSelected(); }}>✕</button>
                </div>
              );
            })}
            {boxes.length === 0 && <p style={{ fontSize: 12.5, color: '#888' }}>Chưa có khung nào cho ảnh này.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function drawLabel(ctx: CanvasRenderingContext2D, label: string, color: string, x: number, y: number) {
  ctx.font = '12px sans-serif';
  const textW = ctx.measureText(label).width + 8;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 16, textW, 16);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x + 4, y - 4);
}

function boundingRect(points: Point[]) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function pointInPolygon(x: number, y: number, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y, xj = points[j].x, yj = points[j].y;
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function cloneBox(b: Box): Box {
  return { ...b, points: b.points ? (b.points.map((p) => ({ ...p })) as [Point, Point, Point, Point]) : undefined };
}

function annotationToBox(a: Annotation): Box {
  if (a.type === 'quad' && a.points && a.points.length === 4) {
    return { id: a.id, class_id: a.class_id, type: 'quad', x: a.x, y: a.y, w: a.w, h: a.h, points: a.points };
  }
  return { id: a.id, class_id: a.class_id, type: 'bbox', x: a.x, y: a.y, w: a.w, h: a.h };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function effectiveHotkey(cls: ClassLabel, idx: number): string | null {
  const custom = cls.hotkey?.trim();
  if (custom) return custom;
  return idx < 9 ? String(idx + 1) : null;
}

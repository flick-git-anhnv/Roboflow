import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getCurrentUser } from '../api';
import type { Annotation, ClassLabel, ImageItem, ImageWithAnnotations, Point, SuggestedBox } from '../types';

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
/** STEP-5.1: Undo stack size limit */
const MAX_UNDO = 50;

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
  const [doneBusy, setDoneBusy] = useState(false);
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
  /** STEP-3.4: version annotation hiện tại của ảnh — dùng làm expectedVersion khi save.
   * Dùng ref thay state để tránh stale closure trong setTimeout của scheduleSave. */
  const annotationVersionRef = useRef<number>(0);

  const [zoom, setZoom] = useState(1);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  /** STEP-4.2: trạng thái gọi prefill tự động khi mở ảnh chưa có annotation. */
  const [prefillLoading, setPrefillLoading] = useState(false);
  /** STEP-4.2: số gợi ý vừa load — hiện banner thông báo để user biết. */
  const [prefillCount, setPrefillCount] = useState(0);
  /** STEP-5.2: Flag loading khi đang gọi API lấy annotation ảnh trước để copy. */
  const [copyingLabels, setCopyingLabels] = useState(false);
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);

  /** STEP-5.4: Filmstrip — dải ảnh thumbnail cuộn ngang dưới canvas. */
  const filmstripRef = useRef<HTMLDivElement>(null);
  const [showFilmstrip, setShowFilmstrip] = useState<boolean>(() => {
    try { return localStorage.getItem('filmstrip_visible') !== 'false'; } catch { return true; }
  });

  /** STEP-5.5: MRU — danh sách tối đa 9 class dùng gần nhất, persist localStorage per project. */
  const [mruClassIds, setMruClassIds] = useState<string[]>(() => {
    if (!projectId) return [];
    try {
      const stored = localStorage.getItem(`mru_classes_${projectId}`);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch { return []; }
  });

  /** STEP-5.5: Buffer 2-char hotkey — tích lũy ký tự để khớp hotkey 1-2 ký tự. */
  const hotkeyBufferRef = useRef<string>('');
  const hotkeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** STEP-5.5: Ctrl+K quick switcher — state modal fuzzy search. */
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [switcherQuery, setSwitcherQuery] = useState('');
  const [switcherIdx, setSwitcherIdx] = useState(0);
  const switcherInputRef = useRef<HTMLInputElement>(null);

  // STEP-5.1: Undo/Redo history (client-side only, cleared on save success / image change)
  const undoStackRef = useRef<Box[][]>([]);
  const redoStackRef = useRef<Box[][]>([]);
  /** Mirror of boxes state, updated synchronously via useEffect — used for snapshot capture. */
  const boxesRef = useRef<Box[]>([]);
  /** Snapshot captured at drag start (mousedown) for move/resize/draw — pushed to undoStack on drag end. */
  const preDragSnapshotRef = useRef<Box[] | null>(null);
  /** Tracks the last drawn box dimensions synchronously inside handleDragMove for draw mode. */
  const lastDrawnSizeRef = useRef<{ w: number; h: number } | null>(null);
  /** Sizes for disabling Undo/Redo buttons in toolbar (re-render trigger). */
  const [undoSize, setUndoSize] = useState(0);
  const [redoSize, setRedoSize] = useState(0);

  /** Keep boxesRef in sync with boxes state (runs after each render). */
  useEffect(() => { boxesRef.current = boxes; }, [boxes]);

  /** STEP-5.4: Auto-scroll filmstrip để highlight ảnh đang mở khi imageId thay đổi. */
  useEffect(() => {
    if (!showFilmstrip || !filmstripRef.current) return;
    const el = filmstripRef.current.querySelector(`[data-id="${imageId}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [imageId, showFilmstrip]);

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
    let cancelled = false;

    setImgEl(null);
    setPrefillLoading(false);
    setPrefillCount(0);
    // STEP-5.1: Clear undo/redo history when navigating to a new image
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoSize(0);
    setRedoSize(0);

    api.getImage(projectId, imageId).then((img) => {
      if (cancelled) return;
      setImage(img);
      const imgBoxes = img.annotations.map((a: Annotation) => annotationToBox(a));
      setBoxes(imgBoxes);
      setSelectedId(null);
      setDrawingPoints([]);
      setSaveState('saved');
      setZoom(1);
      // STEP-3.4: ghi nhớ version để dùng làm expectedVersion khi save
      annotationVersionRef.current = img.annotationVersion ?? 0;
      const el = new window.Image();
      el.onload = () => { if (!cancelled) setImgEl(el); };
      el.src = `/uploads/${projectId}/${img.filename}`;

      // STEP-4.2: auto-prefill khi ảnh chưa có annotation nào
      // Dùng setBoxes (không qua updateBoxes) → KHÔNG trigger scheduleSave.
      // User phải thực hiện thay đổi thực sự trước khi gợi ý được lưu vào DB.
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
            // Lỗi prefill (422 chưa có model, 503 service down...) → bỏ qua,
            // không hiển thị lỗi — prefill là tính năng phụ trợ, không block UX.
            if (!cancelled) setPrefillLoading(false);
          });
      }
    });

    return () => { cancelled = true; };
  }, [projectId, imageId]);

  const currentIndex = useMemo(() => images.findIndex((i) => i.id === imageId), [images, imageId]);
  /** STEP-5.2: ImageItem của ảnh ngay trước trong danh sách (null nếu đang ở ảnh đầu tiên). */
  const prevImageItem = currentIndex > 0 ? images[currentIndex - 1] : null;

  const goTo = useCallback((delta: number) => {
    const next = images[currentIndex + delta];
    if (next) navigate(`/projects/${projectId}/annotate/${next.id}`);
  }, [images, currentIndex, navigate, projectId]);

  /** STEP-5.4: Nhảy thẳng đến ảnh theo ID — dùng cho filmstrip click. */
  const goToImageId = useCallback((id: string) => {
    navigate(`/projects/${projectId}/annotate/${id}`);
  }, [navigate, projectId]);

  /** STEP-5.4: Toggle hiện/ẩn filmstrip, lưu trạng thái vào localStorage. */
  const toggleFilmstrip = useCallback(() => {
    setShowFilmstrip((prev) => {
      const next = !prev;
      try { localStorage.setItem('filmstrip_visible', String(next)); } catch {}
      return next;
    });
  }, []);

  /** STEP-5.5: Cập nhật MRU — đẩy classId vừa dùng lên đầu, giới hạn 9 phần tử, persist localStorage. */
  const pushToMru = useCallback((classId: string) => {
    setMruClassIds((prev) => {
      const filtered = prev.filter((id) => id !== classId);
      const next = [classId, ...filtered].slice(0, 9);
      try { if (projectId) localStorage.setItem(`mru_classes_${projectId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [projectId]);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  /** STEP-5.5: Kết quả tìm kiếm fuzzy cho quick switcher (filter realtime theo switcherQuery). */
  const switcherResults = useMemo(
    () => classes.filter((c) => fuzzyMatch(switcherQuery, c.name)),
    [classes, switcherQuery],
  );

  /** STEP-5.5: Auto-focus input khi modal mở. */
  useEffect(() => {
    if (showSwitcher) {
      const t = setTimeout(() => switcherInputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [showSwitcher]);

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

  // ── Done status (STEP-3.5) ────────────────────────────────────────────────────
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

  const scheduleSave = useCallback((nextBoxes: Box[]) => {
    setSaveState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!imageId) return;
      setSaveState('saving');
      try {
        // STEP-3.4: gửi kèm expectedVersion để server phát hiện conflict
        const result = await api.saveAnnotations(
          imageId,
          nextBoxes.map((b) => ({
            class_id: b.class_id, x: b.x, y: b.y, w: b.w, h: b.h,
            type: b.type, points: b.type === 'quad' && b.points ? b.points : null,
          })),
          annotationVersionRef.current,
        );
        // Cập nhật version sau khi save thành công
        annotationVersionRef.current = result.annotationVersion;
        setSaveState('saved');
        // STEP-5.1: Clear undo/redo history after successful save — undo không hoạt động sau khi đã lưu
        undoStackRef.current = [];
        redoStackRef.current = [];
        setUndoSize(0);
        setRedoSize(0);
        setImages((imgs) => imgs.map((i) => (i.id === imageId ? { ...i, status: nextBoxes.length ? 'labeled' : 'unlabeled' } : i)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'ANNOTATION_CONFLICT') {
          // STEP-3.4: Conflict — reload ảnh để lấy bản mới nhất, thông báo user
          setSaveState('saved');
          alert('Ảnh này đã được người khác sửa. Đang tải lại bản mới nhất — thay đổi chưa lưu của bạn sẽ bị mất.');
          if (projectId) {
            api.getImage(projectId, imageId).then((img) => {
              setImage(img);
              setBoxes(img.annotations.map((a: Annotation) => annotationToBox(a)));
              annotationVersionRef.current = img.annotationVersion ?? 0;
              setSaveState('saved');
              // Also clear history on conflict reload
              undoStackRef.current = [];
              redoStackRef.current = [];
              setUndoSize(0);
              setRedoSize(0);
            }).catch(() => {});
          }
        } else {
          // Lỗi khác (network, server 5xx...) — giữ trạng thái dirty để retry
          setSaveState('dirty');
          console.error('[AnnotatorPage] Save failed:', msg);
        }
      }
    }, 600);
  }, [imageId, projectId]);

  // STEP-5.1: Push current boxes as undo snapshot before a user-initiated change.
  // Mutates undoStackRef/redoStackRef directly (refs, not state) — safe to call anywhere.
  const pushHistorySnapshot = () => {
    undoStackRef.current.push(boxesRef.current.map(cloneBox));
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
    setUndoSize(undoStackRef.current.length);
    setRedoSize(0);
  };

  // STEP-5.1: Undo — restore previous snapshot, push current to redo stack
  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const snapshot = undoStackRef.current.pop()!;
    redoStackRef.current.push(boxesRef.current.map(cloneBox));
    setBoxes(snapshot);
    setUndoSize(undoStackRef.current.length);
    setRedoSize(redoStackRef.current.length);
    scheduleSave(snapshot);
    setPrefillCount(0);
  }, [scheduleSave]);

  // STEP-5.1: Redo — reapply a snapshot that was undone
  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const snapshot = redoStackRef.current.pop()!;
    undoStackRef.current.push(boxesRef.current.map(cloneBox));
    setBoxes(snapshot);
    setUndoSize(undoStackRef.current.length);
    setRedoSize(redoStackRef.current.length);
    scheduleSave(snapshot);
    setPrefillCount(0);
  }, [scheduleSave]);

  // STEP-5.2: Copy toàn bộ annotation từ ảnh liền trước sang ảnh hiện tại.
  // Dùng api.getImage hiện có — không cần endpoint server mới.
  // Gọi pushHistorySnapshot() trước khi merge để Ctrl+Z hoàn tác được.
  const copyLabelsFromPrev = useCallback(async () => {
    const prevImg = currentIndex > 0 ? images[currentIndex - 1] : null;
    if (!prevImg || !projectId) return;

    setCopyingLabels(true);
    let prevAnnotations: Annotation[];
    try {
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
      ...annotationToBox(a),
      // Gán ID mới để tránh xung đột với box gốc từ ảnh trước
      id: `copy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }));

    // STEP-5.1: Push snapshot trước khi thay đổi — cho phép Ctrl+Z hoàn tác việc copy
    pushHistorySnapshot();
    setPrefillCount(0);
    const merged = [...boxesRef.current.filter((b) => b.id !== DRAWING_ID), ...copiedBoxes];
    setBoxes(merged);
    scheduleSave(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, images, projectId, scheduleSave]);

  const updateBoxes = (updater: (prev: Box[]) => Box[]) => {
    // STEP-5.1: Push snapshot before every user-initiated box change
    pushHistorySnapshot();
    // STEP-4.2: user bắt đầu chỉnh sửa → dismiss prefill banner
    setPrefillCount(0);
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
          // STEP-5.1: Capture pre-resize snapshot for undo
          preDragSnapshotRef.current = boxesRef.current.map(cloneBox);
          dragRef.current = { mode: 'resize', handle, startX: x, startY: y, orig: cloneBox(sel) };
          attachWindowDragListeners();
          return;
        }
      }
    }
    const hit = hitTestBox(x, y);
    if (hit) {
      setSelectedId(hit.id);
      // STEP-5.1: Capture pre-move snapshot for undo
      preDragSnapshotRef.current = boxesRef.current.map(cloneBox);
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
    // STEP-5.1: Capture pre-draw snapshot and reset draw tracker for undo
    preDragSnapshotRef.current = boxesRef.current.map(cloneBox);
    lastDrawnSizeRef.current = null;
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
      // STEP-5.1: Track drawn dimensions synchronously for handleDragUp to use
      lastDrawnSizeRef.current = { w, h };
      setBoxes((prev) => {
        const rest = prev.filter((b) => b.id !== DRAWING_ID);
        return [...rest, { id: DRAWING_ID, class_id: activeClassId, type: 'bbox', x: x0, y: y0, w, h }];
      });
    } else if (drag.mode === 'move' && drag.orig) {
      // BUGFIX: dùng drag.orig.id (ref, luôn đúng) thay vì `selectedId` (state) —
      // `selectedId` có thể còn là giá trị CŨ tại thời điểm này vì handleDragMove
      // được đóng closure lúc attachWindowDragListeners() chạy trong onMouseDown,
      // TRƯỚC KHI setSelectedId(hit.id) kịp re-render. Khi user bấm-kéo 1 box
      // CHƯA được chọn từ trước, dùng `selectedId` cũ sẽ khiến box ĐANG được chọn
      // trước đó bị di chuyển nhầm thay vì box vừa bấm.
      const targetId = drag.orig.id;
      const dx = x - drag.startX, dy = y - drag.startY;
      const orig = drag.orig;
      if (orig.type === 'quad' && orig.points) {
        const w = image?.width || 0, h = image?.height || 0;
        const newPoints = orig.points.map((p) => ({ x: clamp(p.x + dx, 0, w), y: clamp(p.y + dy, 0, h) })) as [Point, Point, Point, Point];
        setBoxes((prev) => prev.map((b) => (b.id === targetId ? { ...b, points: newPoints, ...boundingRect(newPoints) } : b)));
      } else {
        setBoxes((prev) => prev.map((b) => (b.id === targetId
          ? { ...b, x: clamp(orig.x + dx, 0, (image?.width || 0) - b.w), y: clamp(orig.y + dy, 0, (image?.height || 0) - b.h) }
          : b)));
      }
    } else if (drag.mode === 'resize' && drag.orig) {
      // BUGFIX: tương tự move — dùng drag.orig.id thay vì `selectedId` (xem giải thích trên).
      const targetId = drag.orig.id;
      const orig = drag.orig;
      if (typeof drag.handle === 'number' && orig.points) {
        const newPoints = orig.points.map((p) => ({ ...p })) as [Point, Point, Point, Point];
        newPoints[drag.handle] = { x, y };
        setBoxes((prev) => prev.map((b) => (b.id === targetId ? { ...b, points: newPoints, ...boundingRect(newPoints) } : b)));
      } else {
        let nx = orig.x, ny = orig.y, nw = orig.w, nh = orig.h;
        if (drag.handle === 'se') { nw = x - orig.x; nh = y - orig.y; }
        if (drag.handle === 'ne') { nw = x - orig.x; nh = orig.y + orig.h - y; ny = y; }
        if (drag.handle === 'sw') { nw = orig.x + orig.w - x; nh = y - orig.y; nx = x; }
        if (drag.handle === 'nw') { nw = orig.x + orig.w - x; nh = orig.y + orig.h - y; nx = x; ny = y; }
        if (nw < 0) { nx += nw; nw = -nw; }
        if (nh < 0) { ny += nh; nh = -nh; }
        setBoxes((prev) => prev.map((b) => (b.id === targetId ? { ...b, x: nx, y: ny, w: nw, h: nh } : b)));
      }
    }
  };

  const handleDragUp = () => {
    const drag = dragRef.current;
    if (drag.mode === 'draw') {
      // STEP-5.1: Use lastDrawnSizeRef (updated synchronously in handleDragMove)
      // to determine validity — avoids boxesRef staleness between renders.
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

      // STEP-5.1: Only push history entry when a valid box was actually drawn
      if (willFinalize && preDragSnapshotRef.current) {
        undoStackRef.current.push(preDragSnapshotRef.current);
        if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
        redoStackRef.current = [];
        setUndoSize(undoStackRef.current.length);
        setRedoSize(0);
      }
      preDragSnapshotRef.current = null;
      lastDrawnSizeRef.current = null;
    } else if (drag.mode === 'move' || drag.mode === 'resize') {
      // STEP-5.1: Push pre-drag snapshot for move/resize operations
      if (preDragSnapshotRef.current) {
        undoStackRef.current.push(preDragSnapshotRef.current);
        if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
        redoStackRef.current = [];
        setUndoSize(undoStackRef.current.length);
        setRedoSize(0);
      }
      preDragSnapshotRef.current = null;
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
    pushToMru(classId);
    if (selectedId) {
      updateBoxes((prev) => prev.map((b) => (b.id === selectedId ? { ...b, class_id: classId } : b)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, pushToMru]);

  /** STEP-5.5: Áp dụng class từ quick switcher và đóng modal. */
  const applySwitcherClass = useCallback((classId: string) => {
    assignClassToSelected(classId);
    setShowSwitcher(false);
    setSwitcherQuery('');
  }, [assignClassToSelected]);

  /** STEP-5.5: Xử lý phím trong quick switcher input (↑↓ navigate, Enter chọn, Esc đóng). */
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // STEP-5.5: Ctrl+K → toggle quick switcher (trước HTMLInputElement check để luôn hoạt động)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSwitcher((prev) => {
          if (prev) { setSwitcherQuery(''); return false; }
          setSwitcherQuery('');
          setSwitcherIdx(0);
          return true;
        });
        return;
      }

      if (e.target instanceof HTMLInputElement) return;

      // STEP-5.1: Ctrl+Z → undo last point (if drawing quad) OR undo operation
      // Ctrl+Shift+Z or Ctrl+Y → redo
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else if (drawingPoints.length > 0) {
            undoLastPoint();
          } else {
            undo();
          }
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          redo();
          return;
        }
      }

      // STEP-5.2: Alt+C → copy labels from previous image
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        copyLabelsFromPrev();
        return;
      }

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
        // STEP-5.5: Phím 1-9 → chọn class theo thứ tự MRU (class dùng gần nhất = phím 1)
        if (e.key >= '1' && e.key <= '9') {
          const mruIdx = Number(e.key) - 1;
          const classId = mruClassIds[mruIdx];
          if (classId && classes.find((c) => c.id === classId)) {
            assignClassToSelected(classId);
          }
          return;
        }

        // STEP-5.5: Ký tự chữ → buffer 2-char hotkey với cơ chế timeout 500ms
        if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
          hotkeyBufferRef.current += e.key.toLowerCase();
          if (hotkeyBufferRef.current.length > 2) hotkeyBufferRef.current = e.key.toLowerCase();
          if (hotkeyTimerRef.current) clearTimeout(hotkeyTimerRef.current);

          const buf = hotkeyBufferRef.current;

          if (buf.length === 2) {
            // Kiểm tra khớp 2-char trước
            const match2 = classes.find((c) => c.hotkey?.trim().toLowerCase() === buf);
            if (match2) { assignClassToSelected(match2.id); hotkeyBufferRef.current = ''; return; }
            // Không khớp 2-char → thử ký tự vừa gõ là 1-char hotkey
            const lastKey = e.key.toLowerCase();
            const match1 = classes.find((c) => c.hotkey?.trim().toLowerCase() === lastKey && (c.hotkey?.trim().length ?? 0) === 1);
            if (match1) assignClassToSelected(match1.id);
            hotkeyBufferRef.current = '';
            return;
          }

          // Buffer = 1 ký tự: có hotkey 2-char nào bắt đầu bằng ký tự này không?
          const hasAmbiguous = classes.some((c) => {
            const hk = c.hotkey?.trim().toLowerCase() ?? '';
            return hk.length === 2 && hk.startsWith(buf);
          });

          if (!hasAmbiguous) {
            // Không nhập nhằng → áp dụng ngay nếu có 1-char match
            const match1 = classes.find((c) => c.hotkey?.trim().toLowerCase() === buf && (c.hotkey?.trim().length ?? 0) === 1);
            if (match1) assignClassToSelected(match1.id);
            hotkeyBufferRef.current = '';
            return;
          }

          // Có thể nhập nhằng với 2-char hotkey → chờ 500ms
          hotkeyTimerRef.current = setTimeout(() => {
            const b = hotkeyBufferRef.current;
            hotkeyBufferRef.current = '';
            const match = classes.find((c) => c.hotkey?.trim().toLowerCase() === b);
            if (match) assignClassToSelected(match.id);
          }, 500);
          return;
        }
      }

      if (e.key === 'ArrowRight') goTo(1);
      if (e.key === 'ArrowLeft') goTo(-1);
      // STEP-3.5: phím D để toggle done status
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (image?.completed_at) { handleUnmarkDone(); } else { handleMarkDone(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, deleteSelected, classes, goTo, drawingPoints, cancelDrawing, undoLastPoint, assignClassToSelected, image, handleMarkDone, handleUnmarkDone, undo, redo, copyLabelsFromPrev, mruClassIds]);

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

        {/* STEP-5.1: Undo/Redo buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-outline"
            onClick={undo}
            disabled={undoSize === 0}
            title="Hoàn tác thao tác vừa rồi (Ctrl+Z)"
            style={{ fontSize: 12, padding: '2px 8px', opacity: undoSize === 0 ? 0.45 : 1 }}
          >
            ↩ Hoàn tác{undoSize > 0 ? ` (${undoSize})` : ''}
          </button>
          <button
            className="btn btn-outline"
            onClick={redo}
            disabled={redoSize === 0}
            title="Làm lại thao tác vừa hoàn tác (Ctrl+Y / Ctrl+Shift+Z)"
            style={{ fontSize: 12, padding: '2px 8px', opacity: redoSize === 0 ? 0.45 : 1 }}
          >
            ↪ Làm lại{redoSize > 0 ? ` (${redoSize})` : ''}
          </button>
        </div>

        {/* STEP-5.2: Copy labels from previous image button */}
        {(() => {
          const disabled = !prevImageItem || prevImageItem.status === 'unlabeled' || copyingLabels;
          return (
            <button
              className="btn btn-outline"
              onClick={copyLabelsFromPrev}
              disabled={disabled}
              title="Copy toàn bộ nhãn từ ảnh liền trước sang ảnh này (Alt+C). Disable khi ảnh trước chưa có nhãn."
              style={{ fontSize: 12, padding: '2px 8px', opacity: disabled ? 0.45 : 1 }}
            >
              {copyingLabels ? '⏳ Đang copy...' : '📋 Copy nhãn ảnh trước (Alt+C)'}
            </button>
          );
        })()}

        <div className="zoom-controls">
          <button className="btn btn-outline" onClick={() => setZoomClamped(zoom / 1.25)} disabled={zoom <= 1} title="Thu nhỏ">−</button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button className="btn btn-outline" onClick={() => setZoomClamped(zoom * 1.25)} disabled={zoom >= 8} title="Phóng to">+</button>
          <button className="btn btn-outline" onClick={() => setZoom(1)} disabled={zoom === 1} title="Về vừa khung hình">⤢ Fit</button>
        </div>

        {/* STEP-5.4: Filmstrip toggle */}
        <button
          className="btn btn-outline"
          onClick={toggleFilmstrip}
          title={showFilmstrip ? 'Ẩn dải ảnh (filmstrip)' : 'Hiện dải ảnh (filmstrip)'}
          style={{ fontSize: 12, padding: '2px 8px' }}
        >
          {showFilmstrip ? '▼ Dải ảnh' : '▲ Dải ảnh'}
        </button>

        <span style={{ fontSize: 13, color: '#666' }}>{currentIndex + 1} / {images.length} — {image.original_name}</span>
        <span className={`save-status ${saveState}`}>
          {saveState === 'saved' ? '✓ Đã lưu' : saveState === 'saving' ? 'Đang lưu...' : 'Chưa lưu...'}
        </span>

        {/* STEP-3.5: Done status button — TRƯỚC nút Gửi duyệt */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          {image.completed_at ? (
            <button
              className="btn"
              disabled={doneBusy}
              onClick={handleUnmarkDone}
              title="Bấm để bỏ đánh dấu xong (phím D)"
              style={{ background: '#2e7d32', color: '#fff', border: 'none', fontWeight: 600 }}
            >
              ✓ Đã xong
            </button>
          ) : (
            <button
              className="btn btn-outline"
              disabled={doneBusy}
              onClick={handleMarkDone}
              title="Xác nhận đã gán nhãn xong ảnh này (phím D)"
            >
              ☐ Xong (D)
            </button>
          )}
        </div>

        <div className="review-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

      {/* STEP-4.2: banner prefill — loading hoặc kết quả */}
      {prefillLoading && (
        <div style={{
          background: '#f0f4ff', borderBottom: '1px solid #B8B3D6',
          padding: '6px 14px', fontSize: 12.5, color: '#4A3F8C',
        }}>
          ⏳ Đang tải gợi ý bbox từ model...
        </div>
      )}
      {!prefillLoading && prefillCount > 0 && (
        <div style={{
          background: '#fff8f0', borderBottom: '1px solid #FFAA80',
          padding: '6px 14px', fontSize: 12.5, color: '#8a4000',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>💡 {prefillCount} gợi ý bbox từ model mặc định. Sửa hoặc xoá rồi lưu để xác nhận.</span>
          <button
            className="btn btn-outline"
            style={{ fontSize: 11, padding: '1px 8px' }}
            onClick={() => updateBoxes(() => [])}
          >
            Bỏ tất cả gợi ý
          </button>
        </div>
      )}

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

      {/* STEP-5.4: height thu hẹp khi filmstrip hiện để không overflow */}
      <div className="annotator-layout"
        style={showFilmstrip ? { height: 'calc(100vh - 246px)' } : undefined}
      >
        <div className="side-panel" style={{ position: 'static' }}>
          <div>
            <h4 style={{
              display: 'flex', alignItems: 'center', gap: 6,
              color: selectedId ? 'var(--orange)' : undefined,
            }}>
              {selectedId && <span style={{ fontSize: 11 }}>●</span>}
              {selectedId ? 'Đổi nhãn khung đã chọn' : 'Chọn nhãn cho khung mới (chưa chọn khung nào)'}
            </h4>
            <div className="class-list-scroll">
              {classes.map((c) => {
                const highlighted = selectedId
                  ? boxes.find((b) => b.id === selectedId)?.class_id === c.id
                  : activeClassId === c.id;
                const mruIdx = mruClassIds.indexOf(c.id);
                const mruKey = mruIdx >= 0 && mruIdx < 9 ? String(mruIdx + 1) : null;
                return (
                  <div key={c.id} className={`class-picker-row ${highlighted ? 'active' : ''}`}
                    onClick={() => assignClassToSelected(c.id)}>
                    <span className="swatch" style={{ background: c.color }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      {mruKey && <span className="key">{mruKey}</span>}
                      {c.hotkey && <span className="key custom">{c.hotkey}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11.5, color: '#888', margin: '4px 0 0' }}>
              Phím 1-9 = 9 class dùng gần nhất (MRU). Ctrl+K = tìm nhanh.
            </p>
            {classes.length === 0 && <p style={{ fontSize: 12.5, color: '#888' }}>Chưa có nhãn nào. Quay lại project để thêm nhãn.</p>}
          </div>
          <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
            <b>Box:</b> kéo chuột để vẽ khung chữ nhật.<br />
            <b>Quad:</b> bấm lần lượt 4 điểm quanh vật xiên/nghiêng.<br />
            Delete = xoá khung đã chọn.<br />
            <b>Zoom:</b> lăn chuột hoặc nút +/−. <b>Pan:</b> Space + kéo.<br />
            <b>Hoàn tác:</b> Ctrl+Z | <b>Làm lại:</b> Ctrl+Y<br />
            <b>Copy nhãn ảnh trước:</b> Alt+C<br />
            <b>Chọn class nhanh:</b> <b>Ctrl+K</b> (fuzzy search)<br />
            <b>Phím 1-9:</b> 9 class MRU (dùng gần nhất = 1)<br />
            <b>Hotkey 2 ký tự:</b> gõ nhanh 2 ký tự liên tiếp (≤500ms)
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

      {/* STEP-5.4: Filmstrip — dải ảnh thumbnail cuộn ngang.
          - Click thumbnail → nhảy sang ảnh đó (goToImageId).
          - Highlight ảnh đang mở bằng viền cam #F05922.
          - Badge màu ở dưới mỗi thumb: trạng thái labeled/done/review.
          - Lazy load qua browser native (loading="lazy") + thumbnail endpoint STEP-1.3.
          - Ẩn/hiện bằng nút toggle, trạng thái persist localStorage. */}
      {/* STEP-5.5: Quick class switcher — Ctrl+K mở modal fuzzy search */}
      {showSwitcher && (
        <div
          className="class-switcher-overlay"
          onClick={() => { setShowSwitcher(false); setSwitcherQuery(''); }}
        >
          <div className="class-switcher-modal" onClick={(e) => e.stopPropagation()}>
            <input
              ref={switcherInputRef}
              className="class-switcher-input"
              value={switcherQuery}
              onChange={(e) => { setSwitcherQuery(e.target.value); setSwitcherIdx(0); }}
              onKeyDown={handleSwitcherKey}
              placeholder="Tìm nhãn... (↑↓ di chuyển, Enter chọn, Esc đóng)"
            />
            <div className="class-switcher-list">
              {switcherResults.map((c, i) => {
                const mi = mruClassIds.indexOf(c.id);
                return (
                  <div
                    key={c.id}
                    className={`class-switcher-row${i === switcherIdx ? ' selected' : ''}`}
                    onClick={() => applySwitcherClass(c.id)}
                    onMouseEnter={() => setSwitcherIdx(i)}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: c.color, display: 'inline-block' }} />
                    <span style={{ flex: 1 }}>{c.name}</span>
                    {mi >= 0 && mi < 9 && <span className="key" style={{ fontSize: 11 }}>{mi + 1}</span>}
                    {c.hotkey && <span className="key custom" style={{ fontSize: 11 }}>{c.hotkey}</span>}
                  </div>
                );
              })}
              {switcherResults.length === 0 && (
                <div style={{ padding: '10px 16px', color: '#888', fontSize: 13 }}>Không tìm thấy nhãn nào</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showFilmstrip && (
        <div className="filmstrip" ref={filmstripRef}>
          {images.map((img) => {
            const isActive = img.id === imageId;
            // Badge priority: review_status > completed_at > status (labeled/unlabeled)
            let badgeBg = '#555';
            let badgeText = 'Chưa gán';
            if (img.status === 'labeled') { badgeBg = '#251C53'; badgeText = 'Đã gán'; }
            if (img.completed_at) { badgeBg = '#2e7d32'; badgeText = '✓ Xong'; }
            if (img.review_status === 'in_review') { badgeBg = '#4A3F8C'; badgeText = 'Chờ duyệt'; }
            if (img.review_status === 'approved') { badgeBg = '#2e7d32'; badgeText = '✓ Duyệt'; }
            if (img.review_status === 'rejected') { badgeBg = '#F05922'; badgeText = 'Từ chối'; }
            return (
              <div
                key={img.id}
                data-id={img.id}
                className={`filmstrip-thumb${isActive ? ' active' : ''}`}
                onClick={() => goToImageId(img.id)}
                title={img.original_name}
              >
                <img
                  src={`/api/images/${img.id}/thumb?size=80`}
                  alt={img.original_name}
                  loading="lazy"
                  width={80}
                  height={80}
                />
                <span className="filmstrip-badge" style={{ background: badgeBg }}>{badgeText}</span>
              </div>
            );
          })}
        </div>
      )}
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

/** STEP-4.2: Chuyển SuggestedBox (từ /prefill) → Box (state nội bộ AnnotatorPage).
 *  ID dùng prefix "suggest_" để phân biệt nguồn gốc (không ảnh hưởng logic save). */
function suggestionToBox(s: SuggestedBox): Box {
  const id = `suggest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (s.type === 'quad' && s.points && s.points.length === 4) {
    return { id, class_id: s.class_id, type: 'quad', x: s.x, y: s.y, w: s.w, h: s.h,
      points: s.points as [Point, Point, Point, Point] };
  }
  return { id, class_id: s.class_id, type: 'bbox', x: s.x, y: s.y, w: s.w, h: s.h };
}

/** STEP-5.5: Fuzzy match — substring trước, nếu không khớp thì sequential character match, không phân biệt hoa thường. */
function fuzzyMatch(query: string, name: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  if (n.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

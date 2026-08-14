import { useCallback, useEffect, useRef } from 'react';
import type { ClassLabel, ImageWithAnnotations } from '../../../types';
import type { Point } from '../types';

interface UseHotkeysOptions {
  labelType?: string;
  selectedId: string | null;
  selectedIds: Set<string>;
  drawingPoints: Point[];
  mruClassIds: string[];
  classes: ClassLabel[];
  image: ImageWithAnnotations | null;
  clipboardBoxRef: React.MutableRefObject<any>;
  setShowSwitcher: React.Dispatch<React.SetStateAction<boolean>>;
  setSwitcherQuery: React.Dispatch<React.SetStateAction<string>>;
  setSwitcherIdx: React.Dispatch<React.SetStateAction<number>>;
  onUndo: () => void;
  onRedo: () => void;
  onUndoLastPoint: () => void;
  onCancelDrawing: () => void;
  onSelectOnly: (id: string | null) => void;
  onDeleteSelected: () => void;
  onClearAllBoxes?: () => void;
  onCopySelectedBox: () => void;
  onPasteBox: () => void;
  onCopyLabelsFromPrev: () => void;
  onCopyImage?: () => void;
  onDeleteImage?: () => void;
  onAssignClassToSelected: (classId: string) => void;
  onGoTo: (delta: number) => void;
  onHandleMarkDone: () => void;
  onHandleUnmarkDone: () => void;
  onClassifyImage?: (classId: string) => void;
}

export function useHotkeys({
  labelType,
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
  onUndo,
  onRedo,
  onUndoLastPoint,
  onCancelDrawing,
  onSelectOnly,
  onDeleteSelected,
  onClearAllBoxes,
  onCopySelectedBox,
  onPasteBox,
  onCopyLabelsFromPrev,
  onCopyImage,
  onDeleteImage,
  onAssignClassToSelected,
  onGoTo,
  onHandleMarkDone,
  onHandleUnmarkDone,
  onClassifyImage,
}: UseHotkeysOptions) {
  const hotkeyBufferRef = useRef<string>('');
  const hotkeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+K → toggle quick switcher
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

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) return;

      // Copy image shortcut: Ctrl+Shift+C or Alt+Shift+C
      if (((e.ctrlKey || e.metaKey || e.altKey) && e.shiftKey) && (e.key === 'c' || e.key === 'C')) {
        if (onCopyImage) {
          e.preventDefault();
          onCopyImage();
          return;
        }
      }

      // Delete image shortcut: Alt+Delete or Alt+Backspace
      if (e.altKey && !e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (onDeleteImage) {
          e.preventDefault();
          onDeleteImage();
          return;
        }
      }

      // Clear all annotations shortcut: Shift+Delete or Shift+Backspace or Ctrl+Shift+Delete
      if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (onClearAllBoxes) {
          e.preventDefault();
          onClearAllBoxes();
          return;
        }
      }

      // Ctrl+Z / Ctrl+Y
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            onRedo();
          } else if (drawingPoints.length > 0) {
            onUndoLastPoint();
          } else {
            onUndo();
          }
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          onRedo();
          return;
        }
        if (key === 'c') {
          if (selectedId) { e.preventDefault(); onCopySelectedBox(); }
          return;
        }
        if (key === 'v') {
          if (clipboardBoxRef.current) { e.preventDefault(); onPasteBox(); }
          return;
        }
      }

      // Alt+C: Copy labels from prev image
      if (e.altKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        onCopyLabelsFromPrev();
        return;
      }

      if (e.key === 'Escape' && drawingPoints.length > 0) { onCancelDrawing(); return; }
      if (e.key === 'Escape' && (selectedIds.size > 0 || selectedId)) { onSelectOnly(null); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && drawingPoints.length > 0) {
        e.preventDefault();
        onUndoLastPoint();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedId || selectedIds.size > 0)) {
        e.preventDefault();
        onDeleteSelected();
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const isClassify = labelType === 'classify';
        // Buffer 2-char hotkey (500ms debounce)
        if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
          hotkeyBufferRef.current += e.key.toLowerCase();
          if (hotkeyBufferRef.current.length > 2) hotkeyBufferRef.current = e.key.toLowerCase();
          if (hotkeyTimerRef.current) clearTimeout(hotkeyTimerRef.current);

          const buf = hotkeyBufferRef.current;

          if (buf.length === 2) {
            const match2 = classes.find((c) => c.hotkey?.trim().toLowerCase() === buf);
            if (match2) {
              if (isClassify && onClassifyImage) onClassifyImage(match2.id);
              else onAssignClassToSelected(match2.id);
              hotkeyBufferRef.current = '';
              return;
            }
            const lastKey = e.key.toLowerCase();
            const match1 = classes.find((c) => c.hotkey?.trim().toLowerCase() === lastKey && (c.hotkey?.trim().length ?? 0) === 1);
            if (match1) {
              if (isClassify && onClassifyImage) onClassifyImage(match1.id);
              else onAssignClassToSelected(match1.id);
            }
            hotkeyBufferRef.current = '';
            return;
          }

          const hasAmbiguous = classes.some((c) => {
            const hk = c.hotkey?.trim().toLowerCase() ?? '';
            return hk.length === 2 && hk.startsWith(buf);
          });

          if (!hasAmbiguous) {
            const match1 = classes.find((c) => c.hotkey?.trim().toLowerCase() === buf && (c.hotkey?.trim().length ?? 0) === 1);
            if (match1) {
              if (isClassify && onClassifyImage) onClassifyImage(match1.id);
              else onAssignClassToSelected(match1.id);
            }
            hotkeyBufferRef.current = '';
            return;
          }

          hotkeyTimerRef.current = setTimeout(() => {
            const b = hotkeyBufferRef.current;
            hotkeyBufferRef.current = '';
            const match = classes.find((c) => c.hotkey?.trim().toLowerCase() === b);
            if (match) {
              if (isClassify && onClassifyImage) onClassifyImage(match.id);
              else onAssignClassToSelected(match.id);
            }
          }, 500);
          return;
        }
      }

      if (e.key === 'ArrowRight') onGoTo(1);
      if (e.key === 'ArrowLeft') onGoTo(-1);
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!image?.completed_at) {
          onHandleMarkDone();
        }
        onGoTo(1);
      }
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (image?.completed_at) { onHandleUnmarkDone(); } else { onHandleMarkDone(); }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    labelType, selectedId, selectedIds, drawingPoints, mruClassIds, classes, image, clipboardBoxRef,
    setShowSwitcher, setSwitcherQuery, setSwitcherIdx, onUndo, onRedo, onUndoLastPoint,
    onCancelDrawing, onSelectOnly, onDeleteSelected, onClearAllBoxes, onCopySelectedBox, onPasteBox,
    onCopyLabelsFromPrev, onCopyImage, onDeleteImage, onAssignClassToSelected, onGoTo, onHandleMarkDone, onHandleUnmarkDone,
    onClassifyImage,
  ]);
}

export default useHotkeys;

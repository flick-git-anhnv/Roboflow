import { useCallback, useEffect, useRef } from 'react';
import type { ClassLabel, ImageWithAnnotations } from '../../../types';
import type { Point } from '../types';

interface UseHotkeysOptions {
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
  onCopySelectedBox: () => void;
  onPasteBox: () => void;
  onCopyLabelsFromPrev: () => void;
  onAssignClassToSelected: (classId: string) => void;
  onGoTo: (delta: number) => void;
  onHandleMarkDone: () => void;
  onHandleUnmarkDone: () => void;
}

export function useHotkeys({
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
  onCopySelectedBox,
  onPasteBox,
  onCopyLabelsFromPrev,
  onAssignClassToSelected,
  onGoTo,
  onHandleMarkDone,
  onHandleUnmarkDone,
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

      // Alt+C
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
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
        // Buffer 2-char hotkey (500ms debounce)
        if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
          hotkeyBufferRef.current += e.key.toLowerCase();
          if (hotkeyBufferRef.current.length > 2) hotkeyBufferRef.current = e.key.toLowerCase();
          if (hotkeyTimerRef.current) clearTimeout(hotkeyTimerRef.current);

          const buf = hotkeyBufferRef.current;

          if (buf.length === 2) {
            const match2 = classes.find((c) => c.hotkey?.trim().toLowerCase() === buf);
            if (match2) { onAssignClassToSelected(match2.id); hotkeyBufferRef.current = ''; return; }
            const lastKey = e.key.toLowerCase();
            const match1 = classes.find((c) => c.hotkey?.trim().toLowerCase() === lastKey && (c.hotkey?.trim().length ?? 0) === 1);
            if (match1) onAssignClassToSelected(match1.id);
            hotkeyBufferRef.current = '';
            return;
          }

          const hasAmbiguous = classes.some((c) => {
            const hk = c.hotkey?.trim().toLowerCase() ?? '';
            return hk.length === 2 && hk.startsWith(buf);
          });

          if (!hasAmbiguous) {
            const match1 = classes.find((c) => c.hotkey?.trim().toLowerCase() === buf && (c.hotkey?.trim().length ?? 0) === 1);
            if (match1) onAssignClassToSelected(match1.id);
            hotkeyBufferRef.current = '';
            return;
          }

          hotkeyTimerRef.current = setTimeout(() => {
            const b = hotkeyBufferRef.current;
            hotkeyBufferRef.current = '';
            const match = classes.find((c) => c.hotkey?.trim().toLowerCase() === b);
            if (match) onAssignClassToSelected(match.id);
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
    selectedId, selectedIds, drawingPoints, mruClassIds, classes, image, clipboardBoxRef,
    setShowSwitcher, setSwitcherQuery, setSwitcherIdx, onUndo, onRedo, onUndoLastPoint,
    onCancelDrawing, onSelectOnly, onDeleteSelected, onCopySelectedBox, onPasteBox,
    onCopyLabelsFromPrev, onAssignClassToSelected, onGoTo, onHandleMarkDone, onHandleUnmarkDone,
  ]);
}

export default useHotkeys;

import { useCallback, useRef, useState } from 'react';
import type { ImageWithAnnotations, Point } from '../../../types';
import type { Box } from '../types';
import { clamp, cloneBox } from '../utils';

const DRAWING_ID = '__drawing__';

export function useClipboard(
  image: ImageWithAnnotations | null,
  boxesRef: React.MutableRefObject<Box[]>,
  selectedId: string | null,
  pushHistorySnapshot: () => void,
  setPrefillCount: React.Dispatch<React.SetStateAction<number>>,
  setBoxes: React.Dispatch<React.SetStateAction<Box[]>>,
  scheduleSave: (nextBoxes: Box[]) => void,
  setSelectedId: (id: string | null) => void,
) {
  const clipboardBoxRef = useRef<Box | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);
  const lastMousePosRef = useRef<Point | null>(null);

  const copySelectedBox = useCallback(() => {
    if (!selectedId) return;
    const box = boxesRef.current.find((b) => b.id === selectedId);
    if (!box) return;
    clipboardBoxRef.current = cloneBox(box);
    setHasClipboard(true);
  }, [selectedId, boxesRef]);

  const pasteBox = useCallback(() => {
    const src = clipboardBoxRef.current;
    if (!src || !image) return;
    const OFFSET = 16;
    const srcCenterX = src.x + src.w / 2, srcCenterY = src.y + src.h / 2;
    const cursor = lastMousePosRef.current;
    const dx = cursor ? cursor.x - srcCenterX : OFFSET;
    const dy = cursor ? cursor.y - srcCenterY : OFFSET;
    const maxX = Math.max(0, image.width - src.w);
    const maxY = Math.max(0, image.height - src.h);
    const newId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pasted: Box = {
      ...cloneBox(src),
      id: newId,
      x: clamp(src.x + dx, 0, maxX),
      y: clamp(src.y + dy, 0, maxY),
    };
    if (pasted.type === 'quad' && pasted.points) {
      pasted.points = pasted.points.map((p) => ({
        x: clamp(p.x + dx, 0, image.width),
        y: clamp(p.y + dy, 0, image.height),
      })) as [Point, Point, Point, Point];
    }
    pushHistorySnapshot();
    setPrefillCount(0);
    const next = [...boxesRef.current.filter((b) => b.id !== DRAWING_ID), pasted];
    setBoxes(next);
    scheduleSave(next);
    setSelectedId(newId);
  }, [image, boxesRef, pushHistorySnapshot, setPrefillCount, setBoxes, scheduleSave, setSelectedId]);

  return {
    clipboardBoxRef,
    hasClipboard,
    lastMousePosRef,
    copySelectedBox,
    pasteBox,
  };
}

export default useClipboard;

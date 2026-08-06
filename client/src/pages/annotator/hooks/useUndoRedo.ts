import { useCallback, useRef, useState } from 'react';
import type { Box } from '../types';
import { cloneBox } from '../utils';

const MAX_UNDO = 50;

export function useUndoRedo(
  boxes: Box[],
  setBoxes: React.Dispatch<React.SetStateAction<Box[]>>,
  scheduleSave: (nextBoxes: Box[]) => void,
  setPrefillCount: React.Dispatch<React.SetStateAction<number>>,
) {
  const undoStackRef = useRef<Box[][]>([]);
  const redoStackRef = useRef<Box[][]>([]);
  const boxesRef = useRef<Box[]>(boxes);
  boxesRef.current = boxes;

  const preDragSnapshotRef = useRef<Box[] | null>(null);
  const lastDrawnSizeRef = useRef<{ w: number; h: number } | null>(null);

  const [undoSize, setUndoSize] = useState(0);
  const [redoSize, setRedoSize] = useState(0);

  const pushHistorySnapshot = useCallback(() => {
    undoStackRef.current.push(boxesRef.current.map(cloneBox));
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
    setUndoSize(undoStackRef.current.length);
    setRedoSize(0);
  }, []);

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoSize(0);
    setRedoSize(0);
  }, []);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const snapshot = undoStackRef.current.pop()!;
    redoStackRef.current.push(boxesRef.current.map(cloneBox));
    setBoxes(snapshot);
    setUndoSize(undoStackRef.current.length);
    setRedoSize(redoStackRef.current.length);
    scheduleSave(snapshot);
    setPrefillCount(0);
  }, [setBoxes, scheduleSave, setPrefillCount]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const snapshot = redoStackRef.current.pop()!;
    undoStackRef.current.push(boxesRef.current.map(cloneBox));
    setBoxes(snapshot);
    setUndoSize(undoStackRef.current.length);
    setRedoSize(redoStackRef.current.length);
    scheduleSave(snapshot);
    setPrefillCount(0);
  }, [setBoxes, scheduleSave, setPrefillCount]);

  return {
    undoStackRef,
    redoStackRef,
    boxesRef,
    preDragSnapshotRef,
    lastDrawnSizeRef,
    undoSize,
    redoSize,
    pushHistorySnapshot,
    clearHistory,
    undo,
    redo,
    setUndoSize,
    setRedoSize,
  };
}

export default useUndoRedo;

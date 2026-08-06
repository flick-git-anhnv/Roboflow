import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import useUndoRedo from '../../pages/annotator/hooks/useUndoRedo';
import type { Box } from '../../pages/annotator/types';

describe('useUndoRedo Hook', () => {
  const initialBoxes: Box[] = [
    { id: 'b1', class_id: 'c1', type: 'bbox', x: 10, y: 10, w: 50, h: 50 },
  ];

  it('manages pushHistorySnapshot, undo and redo correctly', () => {
    let boxes = initialBoxes;
    const setBoxes = vi.fn((next: Box[] | ((prev: Box[]) => Box[])) => {
      boxes = typeof next === 'function' ? next(boxes) : next;
    });
    const scheduleSave = vi.fn();
    const setPrefillCount = vi.fn();

    const { result } = renderHook(() =>
      useUndoRedo(boxes, setBoxes, scheduleSave, setPrefillCount)
    );

    expect(result.current.undoSize).toBe(0);
    expect(result.current.redoSize).toBe(0);

    // Push initial snapshot before change
    act(() => {
      result.current.pushHistorySnapshot();
    });
    expect(result.current.undoSize).toBe(1);

    // Simulate box change
    const newBoxes: Box[] = [
      ...initialBoxes,
      { id: 'b2', class_id: 'c1', type: 'bbox', x: 70, y: 70, w: 30, h: 30 },
    ];
    boxes = newBoxes;

    // Undo
    act(() => {
      result.current.undo();
    });

    expect(setBoxes).toHaveBeenCalled();
    expect(scheduleSave).toHaveBeenCalled();
    expect(result.current.undoSize).toBe(0);
    expect(result.current.redoSize).toBe(1);

    // Redo
    act(() => {
      result.current.redo();
    });

    expect(result.current.undoSize).toBe(1);
    expect(result.current.redoSize).toBe(0);
  });
});

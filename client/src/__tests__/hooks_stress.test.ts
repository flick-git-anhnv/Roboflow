import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useUndoRedo } from '../pages/annotator/hooks/useUndoRedo';
import { useZoomPan } from '../pages/annotator/hooks/useZoomPan';
import { useDatasetFilters } from '../pages/project-detail/hooks/useDatasetFilters';
import { useBatchSelection } from '../pages/project-detail/hooks/useBatchSelection';
import type { Box } from '../pages/annotator/types';
import type { ImageItem, ClassLabel } from '../types';

describe('Custom Hooks Stress & Edge Case Tests', () => {
  describe('useUndoRedo', () => {
    it('handles empty box array and MAX_UNDO limit (50)', () => {
      let boxes: Box[] = [];
      const setBoxes = vi.fn((newBoxes) => {
        boxes = typeof newBoxes === 'function' ? newBoxes(boxes) : newBoxes;
      });
      const scheduleSave = vi.fn();
      const setPrefillCount = vi.fn();

      const { result } = renderHook(() =>
        useUndoRedo(boxes, setBoxes, scheduleSave, setPrefillCount)
      );

      // Push 60 snapshots
      act(() => {
        for (let i = 0; i < 60; i++) {
          result.current.pushHistorySnapshot();
        }
      });

      expect(result.current.undoSize).toBe(50); // Capped at MAX_UNDO
      expect(result.current.undoStackRef.current.length).toBe(50);

      // Perform undo
      act(() => {
        result.current.undo();
      });

      expect(result.current.redoSize).toBe(1);
      expect(scheduleSave).toHaveBeenCalledTimes(1);
      expect(setPrefillCount).toHaveBeenCalledWith(0);
    });

    it('handles rapid undo/redo on empty stacks without throwing', () => {
      let boxes: Box[] = [];
      const setBoxes = vi.fn();
      const scheduleSave = vi.fn();
      const setPrefillCount = vi.fn();

      const { result } = renderHook(() =>
        useUndoRedo(boxes, setBoxes, scheduleSave, setPrefillCount)
      );

      // Call undo when undo stack is empty
      act(() => {
        result.current.undo();
      });
      expect(scheduleSave).not.toHaveBeenCalled();

      // Call redo when redo stack is empty
      act(() => {
        result.current.redo();
      });
      expect(scheduleSave).not.toHaveBeenCalled();
    });
  });

  describe('useZoomPan', () => {
    it('clamps zoom values correctly', () => {
      const containerRef = { current: document.createElement('div') };
      const { result } = renderHook(() => useZoomPan(null, containerRef));

      act(() => {
        result.current.setZoomClamped(0.2); // below min 1
      });
      expect(result.current.zoom).toBe(1);

      act(() => {
        result.current.setZoomClamped(15); // above max 8
      });
      expect(result.current.zoom).toBe(8);
    });

    it('handles wheel zoom calculation with container rect', () => {
      const container = document.createElement('div');
      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        bottom: 600,
        right: 800,
        toJSON: () => {},
      });
      const containerRef = { current: container };

      const { result } = renderHook(() => useZoomPan(null, containerRef));

      // Simulate wheel event
      const wheelEvent = new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 100 });
      act(() => {
        container.dispatchEvent(wheelEvent);
      });

      expect(result.current.zoom).toBeGreaterThan(1);
    });

    it('cleans up window event listeners when unmounted mid-drag', () => {
      const container = document.createElement('div');
      const containerRef = { current: container };
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { result, unmount } = renderHook(() => useZoomPan(null, containerRef));

      // Initiate panning drag
      const fakeMouseEvent = { clientX: 100, clientY: 100 } as any;
      act(() => {
        result.current.startPan(fakeMouseEvent);
      });
      expect(result.current.isPanning).toBe(true);

      // Unmount while actively panning
      act(() => {
        unmount();
      });

      // Verify removeEventListener was called for mousemove and mouseup
      const removedEvents = removeEventListenerSpy.mock.calls.map((call) => call[0]);
      expect(removedEvents).toContain('mousemove');
      expect(removedEvents).toContain('mouseup');

      // Dispatch mousemove & mouseup on window - should not crash or throw unmounted state warning
      expect(() => {
        window.dispatchEvent(new MouseEvent('mousemove'));
        window.dispatchEvent(new MouseEvent('mouseup'));
      }).not.toThrow();

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('useDatasetFilters', () => {
    it('handles empty image list and invalid search query', () => {
      const { result } = renderHook(() => useDatasetFilters([], []));

      expect(result.current.filteredImages).toEqual([]);
      expect(result.current.pagedImages).toEqual([]);
      expect(result.current.pageCount).toBe(1);
      expect(result.current.hasActiveFilters).toBe(false);

      act(() => {
        result.current.setSearch('  nonexistent_query  ');
      });
      expect(result.current.hasActiveFilters).toBe(true);
      expect(result.current.filteredImages).toEqual([]);
    });

    it('handles images with missing original_name or null fields gracefully', () => {
      const corruptImages: any[] = [
        { id: '1', status: 'annotated', split: 'train', original_name: undefined },
        { id: '2', status: 'unannotated', split: 'val', original_name: null },
      ];
      const classes: ClassLabel[] = [];

      const { result } = renderHook(() => useDatasetFilters(corruptImages, classes));

      // Attempting search when original_name is undefined/null
      let errorThrown = false;
      try {
        act(() => {
          result.current.setSearch('test');
        });
      } catch (err) {
        errorThrown = true;
      }
      expect(errorThrown).toBe(false);
      expect(result.current.filteredImages).toHaveLength(0);
    });

    it('filters correctly when original_name is null, undefined, empty, or numeric', () => {
      const corruptImages: any[] = [
        { id: '1', status: 'annotated', split: 'train', original_name: undefined, class_ids: ['c1'] },
        { id: '2', status: 'unannotated', split: 'val', original_name: null, class_ids: null },
        { id: '3', status: 'annotated', split: 'train', original_name: 'test_sample.jpg', class_ids: ['c1', 'c2'] },
        { id: '4', status: null, split: null, original_name: '', class_ids: undefined },
      ];
      const classes: ClassLabel[] = [
        { id: 'c1', project_id: 'p1', name: 'Car', color: '#ff0000', sort_order: 1, hotkey: null },
      ];

      const { result } = renderHook(() => useDatasetFilters(corruptImages, classes));

      expect(result.current.filteredImages).toHaveLength(4);

      // Filter by search query 'test'
      act(() => {
        result.current.setSearch('test');
      });
      expect(result.current.filteredImages).toHaveLength(1);
      expect(result.current.filteredImages[0].id).toBe('3');

      // Filter by class 'c1'
      act(() => {
        result.current.setSearch('');
        result.current.toggleClassFilter('c1');
      });
      expect(result.current.filteredImages).toHaveLength(2);
      expect(result.current.filteredImages.map((i) => i.id)).toEqual(['1', '3']);
    });
  });

  describe('useBatchSelection', () => {
    it('selects and clears items', () => {
      const setImages = vi.fn();
      const load = vi.fn();
      const showToast = vi.fn();

      const { result } = renderHook(() =>
        useBatchSelection('p1', setImages, load, showToast)
      );

      const fakeEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;

      act(() => {
        result.current.toggleSelect('img-1', fakeEvent);
        result.current.toggleSelect('img-2', fakeEvent);
      });

      expect(result.current.selectedIds.size).toBe(2);
      expect(result.current.selectedIds.has('img-1')).toBe(true);

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedIds.size).toBe(0);
    });

    it('handles null/undefined event in toggleSelect without throwing fatal crash if guarded', () => {
      const setImages = vi.fn();
      const load = vi.fn();
      const showToast = vi.fn();

      const { result } = renderHook(() =>
        useBatchSelection('p1', setImages, load, showToast)
      );

      let errorThrown = false;
      try {
        act(() => {
          result.current.toggleSelect('img-1', null as any);
        });
      } catch (err) {
        errorThrown = true;
      }
      expect(errorThrown).toBe(false);
      expect(result.current.selectedIds.has('img-1')).toBe(true);
    });

    it('handles concurrent async batch deletion without race conditions or state corruption', async () => {
      const setImages = vi.fn();
      const load = vi.fn();
      const showToast = vi.fn();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      const { api } = await import('../api');
      const deleteSpy = vi.spyOn(api, 'batchDeleteImages').mockImplementation(() =>
        new Promise((resolve) => setTimeout(resolve, 30))
      );

      const { result } = renderHook(() =>
        useBatchSelection('p1', setImages, load, showToast)
      );

      act(() => {
        result.current.setSelectedIds(new Set(['img-1', 'img-2', 'img-3']));
      });

      expect(result.current.selectedIds.size).toBe(3);

      let p1: Promise<void> | undefined;
      let p2: Promise<void> | undefined;

      await act(async () => {
        p1 = result.current.batchDelete();
        p2 = result.current.batchDelete();
        await Promise.all([p1, p2]);
      });

      expect(deleteSpy).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Đã xoá'));
      expect(result.current.selectedIds.size).toBe(0);

      confirmSpy.mockRestore();
      deleteSpy.mockRestore();
    });
  });
});

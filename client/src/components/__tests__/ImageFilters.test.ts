import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import useImageFilters from '../../pages/project-detail/hooks/useImageFilters';
import type { ImageItem } from '../../types';

describe('useImageFilters Hook', () => {
  const sampleImages: ImageItem[] = [
    { id: '1', project_id: 'p1', filename: 'img1.jpg', original_name: 'car_01.jpg', width: 800, height: 600, status: 'labeled', split: 'train', completed_at: '2026-08-01', created_at: '2026-08-01', class_ids: ['c1'] },
    { id: '2', project_id: 'p1', filename: 'img2.jpg', original_name: 'truck_02.jpg', width: 800, height: 600, status: 'unlabeled', split: 'valid', completed_at: null, created_at: '2026-08-01', class_ids: [] },
    { id: '3', project_id: 'p1', filename: 'img3.jpg', original_name: 'bus_03.jpg', width: 800, height: 600, status: 'labeled', split: 'test', completed_at: null, created_at: '2026-08-01', class_ids: ['c2'] },
  ];

  it('filters by search term', () => {
    const { result } = renderHook(() => useImageFilters(sampleImages));
    expect(result.current.filteredImages.length).toBe(3);

    act(() => {
      result.current.setSearch('truck');
    });

    expect(result.current.filteredImages.length).toBe(1);
    expect(result.current.filteredImages[0].original_name).toBe('truck_02.jpg');
  });

  it('filters by status', () => {
    const { result } = renderHook(() => useImageFilters(sampleImages));

    act(() => {
      result.current.setStatusFilter('unlabeled');
    });

    expect(result.current.filteredImages.length).toBe(1);
    expect(result.current.filteredImages[0].id).toBe('2');
  });

  it('filters by split', () => {
    const { result } = renderHook(() => useImageFilters(sampleImages));

    act(() => {
      result.current.setSplitFilter('test');
    });

    expect(result.current.filteredImages.length).toBe(1);
    expect(result.current.filteredImages[0].id).toBe('3');
  });

  it('resets filters correctly', () => {
    const { result } = renderHook(() => useImageFilters(sampleImages));

    act(() => {
      result.current.setSearch('bus');
      result.current.setStatusFilter('labeled');
    });

    expect(result.current.hasActiveFilters).toBe(true);

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.filteredImages.length).toBe(3);
  });
});

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ImageItem } from '../../../types';
import type { DoneFilter, ReviewFilter, SplitFilter, StatusFilter } from '../types';

export function useImageFilters(images: ImageItem[]) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [classFilter, setClassFilter] = useState<string[]>([]);
  const [classFilterOpen, setClassFilterOpen] = useState(false);
  const classFilterRef = useRef<HTMLDivElement>(null);
  const [splitFilter, setSplitFilter] = useState<SplitFilter>('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [doneFilter, setDoneFilter] = useState<DoneFilter>('all');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(60);

  const toggleClassFilter = (classId: string) => {
    setClassFilter((prev) => (prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]));
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!classFilterOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (classFilterRef.current && !classFilterRef.current.contains(e.target as Node)) {
        setClassFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [classFilterOpen]);

  const filteredImages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return images.filter((img) => {
      if (statusFilter !== 'all' && img.status !== statusFilter) return false;
      if (splitFilter !== 'all' && img.split !== splitFilter) return false;
      if (classFilter.length > 0 && !(img.class_ids || []).some((id) => classFilter.includes(id))) return false;
      if (reviewFilter !== 'all' && (img.review_status || 'draft') !== reviewFilter) return false;
      if (doneFilter === 'done' && !img.completed_at) return false;
      if (doneFilter === 'not_done' && !!img.completed_at) return false;
      if (q && !img.original_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [images, search, statusFilter, splitFilter, classFilter, reviewFilter, doneFilter]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setClassFilter([]);
    setSplitFilter('all');
    setReviewFilter('all');
    setDoneFilter('all');
  };

  const hasActiveFilters = Boolean(
    search || statusFilter !== 'all' || classFilter.length > 0 || splitFilter !== 'all' || reviewFilter !== 'all' || doneFilter !== 'all'
  );

  useEffect(() => { setPage(1); }, [search, statusFilter, classFilter, splitFilter, reviewFilter, doneFilter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filteredImages.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedImages = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredImages.slice(start, start + pageSize);
  }, [filteredImages, currentPage, pageSize]);

  return {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    classFilter,
    setClassFilter,
    classFilterOpen,
    setClassFilterOpen,
    classFilterRef,
    splitFilter,
    setSplitFilter,
    reviewFilter,
    setReviewFilter,
    doneFilter,
    setDoneFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    toggleClassFilter,
    filteredImages,
    pagedImages,
    pageCount,
    currentPage,
    hasActiveFilters,
    resetFilters,
  };
}

export default useImageFilters;

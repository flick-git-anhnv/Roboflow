import React, { RefObject } from 'react';
import type { ClassLabel } from '../../../types';
import type { DoneFilter, ReviewFilter, SplitFilter, StatusFilter } from '../types';

interface ImageFilterBarProps {
  search: string;
  statusFilter: StatusFilter;
  classFilter: string[];
  classFilterOpen: boolean;
  classFilterRef: RefObject<HTMLDivElement>;
  splitFilter: SplitFilter;
  reviewFilter: ReviewFilter;
  doneFilter: DoneFilter;
  pageSize: number;
  gridSize: 'small' | 'medium' | 'large';
  classes: ClassLabel[];
  canReview: boolean;
  hasActiveFilters: boolean;
  filteredCount: number;
  totalCount: number;
  onSearchChange: (v: string) => void;
  onStatusFilterChange: (v: StatusFilter) => void;
  onClassFilterOpenToggle: () => void;
  onToggleClassFilter: (id: string) => void;
  onClearClassFilter: () => void;
  onSplitFilterChange: (v: SplitFilter) => void;
  onReviewFilterChange: (v: ReviewFilter) => void;
  onDoneFilterChange: (v: DoneFilter) => void;
  onPageSizeChange: (size: number) => void;
  onGridSizeChange: (size: 'small' | 'medium' | 'large') => void;
  onResetFilters: () => void;
}

export const ImageFilterBar: React.FC<ImageFilterBarProps> = ({
  search,
  statusFilter,
  classFilter,
  classFilterOpen,
  classFilterRef,
  splitFilter,
  reviewFilter,
  doneFilter,
  pageSize,
  gridSize,
  classes,
  canReview,
  hasActiveFilters,
  filteredCount,
  totalCount,
  onSearchChange,
  onStatusFilterChange,
  onClassFilterOpenToggle,
  onToggleClassFilter,
  onClearClassFilter,
  onSplitFilterChange,
  onReviewFilterChange,
  onDoneFilterChange,
  onPageSizeChange,
  onGridSizeChange,
  onResetFilters,
}) => {
  return (
    <div className="filter-bar">
      <input
        className="filter-search"
        type="text"
        placeholder="Tìm theo tên ảnh..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}>
        <option value="all">Tất cả trạng thái</option>
        <option value="unlabeled">Chưa gán nhãn</option>
        <option value="labeled">Đã gán nhãn</option>
      </select>
      <div className="multiselect" ref={classFilterRef}>
        <button type="button" className="multiselect-trigger" onClick={onClassFilterOpenToggle}>
          {classFilter.length === 0 ? 'Tất cả nhãn' : `${classFilter.length} nhãn đã chọn`} <span className="multiselect-caret">▾</span>
        </button>
        {classFilterOpen && (
          <div className="multiselect-panel">
            {classes.length === 0 && <p style={{ fontSize: 12.5, color: '#888', margin: '4px 8px' }}>Chưa có nhãn nào.</p>}
            {classes.map((c) => (
              <label key={c.id} className="multiselect-row">
                <input type="checkbox" checked={classFilter.includes(c.id)} onChange={() => onToggleClassFilter(c.id)} />
                <span className="class-swatch" style={{ background: c.color }} />
                {c.name}
              </label>
            ))}
            {classFilter.length > 0 && (
              <button type="button" className="multiselect-clear" onClick={onClearClassFilter}>Bỏ chọn tất cả</button>
            )}
          </div>
        )}
      </div>
      <select value={splitFilter} onChange={(e) => onSplitFilterChange(e.target.value as SplitFilter)}>
        <option value="all">Tất cả tập</option>
        <option value="train">train</option>
        <option value="valid">valid</option>
        <option value="test">test</option>
      </select>
      {canReview && (
        <select value={reviewFilter} onChange={(e) => onReviewFilterChange(e.target.value as ReviewFilter)}>
          <option value="all">Tất cả review</option>
          <option value="in_review">Cần review</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Bị từ chối</option>
          <option value="draft">Nháp</option>
        </select>
      )}
      <select value={doneFilter} onChange={(e) => onDoneFilterChange(e.target.value as DoneFilter)}>
        <option value="all">Tất cả done</option>
        <option value="done">Đã hoàn thành</option>
        <option value="not_done">Chưa hoàn thành</option>
      </select>
      {hasActiveFilters && (
        <button className="btn btn-outline" onClick={onResetFilters}>Xoá bộ lọc</button>
      )}
      <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
        <option value={30}>30 / trang</option>
        <option value={60}>60 / trang</option>
        <option value={120}>120 / trang</option>
        <option value={240}>240 / trang</option>
      </select>
      <select value={gridSize} onChange={(e) => onGridSizeChange(e.target.value as 'small' | 'medium' | 'large')} title="Cỡ hiển thị lưới ảnh (sizemenu)">
        <option value="small">Cỡ nhỏ</option>
        <option value="medium">Cỡ vừa</option>
        <option value="large">Cỡ lớn</option>
      </select>
      <span className="filter-count">{filteredCount} / {totalCount} ảnh</span>
    </div>
  );
};

export default ImageFilterBar;

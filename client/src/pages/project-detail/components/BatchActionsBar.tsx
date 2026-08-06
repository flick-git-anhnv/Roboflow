import React from 'react';
import type { ImageItem, Split } from '../../../types';

interface BatchActionsBarProps {
  selectedIds: Set<string>;
  pagedImages: ImageItem[];
  onSelectPage: (paged: ImageItem[]) => void;
  onBatchChangeSplit: (split: Split) => void;
  onBatchDelete: () => void;
  onClearSelection: () => void;
}

export const BatchActionsBar: React.FC<BatchActionsBarProps> = ({
  selectedIds,
  pagedImages,
  onSelectPage,
  onBatchChangeSplit,
  onBatchDelete,
  onClearSelection,
}) => {
  if (selectedIds.size === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '10px 16px', marginBottom: 12, borderRadius: 8,
      background: '#251C53', color: '#fff', fontSize: 14,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    }}>
      <span style={{ fontWeight: 600, marginRight: 8 }}>Đã chọn {selectedIds.size} ảnh</span>
      <button
        className="btn"
        style={{
          background: 'rgba(255, 255, 255, 0.12)',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          padding: '6px 12px',
          fontSize: 13,
          height: 34,
        }}
        onClick={() => onSelectPage(pagedImages)}
      >
        Chọn trang này
      </button>
      <select
        style={{
          fontSize: 13,
          padding: '0 10px',
          background: 'rgba(255, 255, 255, 0.12)',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: 8,
          cursor: 'pointer',
          minWidth: 130,
          height: 34,
          outline: 'none',
        }}
        value=""
        onChange={(e) => { if (e.target.value) onBatchChangeSplit(e.target.value as Split); e.target.value = ''; }}
      >
        <option value="" style={{ background: '#251C53', color: '#fff' }}>Đổi split…</option>
        <option value="train" style={{ background: '#251C53', color: '#fff' }}>→ train</option>
        <option value="valid" style={{ background: '#251C53', color: '#fff' }}>→ valid</option>
        <option value="test" style={{ background: '#251C53', color: '#fff' }}>→ test</option>
      </select>
      <button
        className="btn"
        style={{
          background: '#F05922',
          color: '#fff',
          padding: '6px 12px',
          fontSize: 13,
          height: 34,
          border: 'none',
        }}
        onClick={onBatchDelete}
      >
        🗑 Xoá {selectedIds.size} ảnh
      </button>
      <button
        className="btn"
        style={{
          background: 'rgba(255, 255, 255, 0.12)',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          padding: '6px 12px',
          fontSize: 13,
          height: 34,
          marginLeft: 'auto',
        }}
        onClick={onClearSelection}
      >
        Bỏ chọn
      </button>
    </div>
  );
};

export default BatchActionsBar;

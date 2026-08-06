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
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '8px 12px', marginBottom: 8, borderRadius: 6,
      background: '#251C53', color: '#fff', fontSize: 13,
    }}>
      <span style={{ fontWeight: 600 }}>Đã chọn {selectedIds.size} ảnh</span>
      <button
        className="btn btn-outline"
        style={{ color: '#fff', borderColor: '#B8B3D6', fontSize: 12 }}
        onClick={() => onSelectPage(pagedImages)}
      >
        Chọn trang này
      </button>
      <select
        style={{ fontSize: 12, padding: '2px 6px', background: '#4A3F8C', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        value=""
        onChange={(e) => { if (e.target.value) onBatchChangeSplit(e.target.value as Split); e.target.value = ''; }}
      >
        <option value="">Đổi split…</option>
        <option value="train">→ train</option>
        <option value="valid">→ valid</option>
        <option value="test">→ test</option>
      </select>
      <button
        className="btn"
        style={{ background: '#F05922', color: '#fff', fontSize: 12 }}
        onClick={onBatchDelete}
      >
        🗑 Xoá {selectedIds.size} ảnh
      </button>
      <button
        className="btn btn-outline"
        style={{ color: '#fff', borderColor: '#B8B3D6', fontSize: 12, marginLeft: 'auto' }}
        onClick={onClearSelection}
      >
        Bỏ chọn
      </button>
    </div>
  );
};

export default BatchActionsBar;

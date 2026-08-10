import React from 'react';
import type { Box } from '../types';

interface PrefillBannerProps {
  prefillLoading: boolean;
  prefillCount: number;
  onClearSuggestions: (updater: (prev: Box[]) => Box[]) => void;
}

export const PrefillBanner: React.FC<PrefillBannerProps> = ({
  prefillLoading,
  prefillCount,
  onClearSuggestions,
}) => {
  if (prefillLoading) {
    return (
      <div style={{
        background: '#f0f4ff', borderBottom: '1px solid #B8B3D6',
        padding: '6px 14px', fontSize: 12.5, color: '#4A3F8C',
      }}>
        ⏳ Đang tải gợi ý bbox từ model...
      </div>
    );
  }

  if (prefillCount > 0) {
    return (
      <div style={{
        background: '#fff8f0', borderBottom: '1px solid #FFAA80',
        padding: '6px 14px', fontSize: 12.5, color: '#8a4000',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span>💡 {prefillCount} gợi ý bbox từ model mặc định. Sửa hoặc xoá rồi lưu để xác nhận.</span>
        <button
          className="btn btn-outline"
          style={{ fontSize: 11, padding: '1px 8px' }}
          onClick={() => onClearSuggestions(() => [])}
        >
          Bỏ tất cả gợi ý
        </button>
      </div>
    );
  }

  return null;
};

export default PrefillBanner;

import React from 'react';
import type { Point } from '../../../types';
import type { Tool } from '../types';

interface QuadHintBannerProps {
  tool: Tool;
  drawingPoints: Point[];
  onUndoLastPoint: () => void;
  onCancelDrawing: () => void;
}

export const QuadHintBanner: React.FC<QuadHintBannerProps> = ({
  tool,
  drawingPoints,
  onUndoLastPoint,
  onCancelDrawing,
}) => {
  if (tool !== 'quad') return null;

  return (
    <div className="hint-text">
      <span>
        {drawingPoints.length === 0
          ? 'Bấm 4 điểm lần lượt quanh vật thể (theo chiều bất kỳ) để tạo khung 4 điểm.'
          : `Đã đặt ${drawingPoints.length}/4 điểm — bấm tiếp điểm thứ ${drawingPoints.length + 1}... (chuột phải để xoá điểm vừa chấm)`}
      </span>
      {drawingPoints.length > 0 && (
        <span className="hint-actions">
          <button className="btn btn-outline" onClick={onUndoLastPoint}>↩ Xoá điểm cuối</button>
          <button className="btn btn-outline" onClick={onCancelDrawing}>✕ Huỷ (Esc)</button>
        </span>
      )}
    </div>
  );
};

export default QuadHintBanner;

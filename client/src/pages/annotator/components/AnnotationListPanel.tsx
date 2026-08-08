import React from 'react';
import type { ClassLabel } from '../../../types';
import type { Box } from '../types';

const DRAWING_ID = '__drawing__';

interface AnnotationListPanelProps {
  boxes: Box[];
  classById: Map<string, ClassLabel>;
  selectedId: string | null;
  selectedIds: Set<string>;
  hoveredId?: string | null;
  onSelectOnly: (id: string | null) => void;
  onUpdateBoxes: (updater: (prev: Box[]) => Box[]) => void;
  onHoverBox?: (id: string | null) => void;
}

export const AnnotationListPanel: React.FC<AnnotationListPanelProps> = ({
  boxes,
  classById,
  selectedId,
  selectedIds,
  hoveredId,
  onSelectOnly,
  onUpdateBoxes,
  onHoverBox,
}) => {
  const visibleBoxes = boxes.filter((b) => b.id !== DRAWING_ID);

  return (
    <div className="side-panel" style={{ position: 'static' }}>
      <h4>Annotations ({visibleBoxes.length})</h4>
      <div className="class-list-scroll">
        {visibleBoxes.map((b) => {
          const cls = classById.get(b.class_id);
          const isHovered = hoveredId === b.id;
          const isSelected = selectedId === b.id || selectedIds.has(b.id);
          return (
            <div key={b.id} className={`annotation-list-row ${isHovered ? 'hovered' : ''}`}
              onClick={() => onSelectOnly(b.id)}
              onMouseEnter={() => onHoverBox?.(b.id)}
              onMouseLeave={() => onHoverBox?.(null)}
              style={{
                outline: isSelected ? `2px solid ${cls?.color || '#F05922'}` : isHovered ? '1px dashed #8b5cf6' : 'none',
                background: isHovered ? 'rgba(139, 92, 246, 0.15)' : undefined
              }}>
              <span className="swatch" style={{ background: cls?.color }} />
              <span>{cls?.name}</span>
              <span className="shape-tag">
                {b.type === 'sam_smart_polygon' ? '🟣 SAM' : b.type === 'quad' ? '◈ 4 điểm' : '▭ box'}
              </span>
              <button onClick={(e) => {
                e.stopPropagation();
                onUpdateBoxes((prev) => prev.filter((x) => x.id !== b.id));
                if (selectedId === b.id) onSelectOnly(null);
              }}>✕</button>
            </div>
          );
        })}
        {visibleBoxes.length === 0 && <p style={{ fontSize: 12.5, color: '#888' }}>Chưa có khung nào cho ảnh này.</p>}
      </div>
    </div>
  );
};


export default AnnotationListPanel;

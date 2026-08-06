import React from 'react';
import type { ClassLabel } from '../../../types';
import type { Box } from '../types';

interface ClassPickerPanelProps {
  classes: ClassLabel[];
  boxes: Box[];
  selectedId: string | null;
  selectedIds: Set<string>;
  activeClassId: string;
  mruClassIds: string[];
  onAssignClassToSelected: (classId: string) => void;
}

export const ClassPickerPanel: React.FC<ClassPickerPanelProps> = ({
  classes,
  boxes,
  selectedId,
  selectedIds,
  activeClassId,
  mruClassIds,
  onAssignClassToSelected,
}) => {
  return (
    <div className="side-panel" style={{ position: 'static' }}>
      <div>
        <h4 style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: selectedId ? 'var(--orange)' : undefined,
        }}>
          {selectedId && <span style={{ fontSize: 11 }}>●</span>}
          {selectedIds.size > 1
            ? `Đổi nhãn cho ${selectedIds.size} khung đã chọn`
            : selectedId ? 'Đổi nhãn khung đã chọn' : 'Chọn nhãn cho khung mới (chưa chọn khung nào)'}
        </h4>
        <div className="class-list-scroll">
          {classes.map((c) => {
            const highlighted = selectedId
              ? boxes.find((b) => b.id === selectedId)?.class_id === c.id
              : activeClassId === c.id;
            const mruIdx = mruClassIds.indexOf(c.id);
            const mruKey = mruIdx >= 0 && mruIdx < 9 ? String(mruIdx + 1) : null;
            return (
              <div key={c.id} className={`class-picker-row ${highlighted ? 'active' : ''}`}
                onClick={() => onAssignClassToSelected(c.id)}>
                <span className="swatch" style={{ background: c.color }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {mruKey && <span className="key">{mruKey}</span>}
                  {c.hotkey && <span className="key custom">{c.hotkey}</span>}
                </span>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 11.5, color: '#888', margin: '4px 0 0' }}>
          Phím 1-9 = 9 class dùng gần nhất (MRU). Ctrl+K = tìm nhanh.
        </p>
        {classes.length === 0 && <p style={{ fontSize: 12.5, color: '#888' }}>Chưa có nhãn nào. Quay lại project để thêm nhãn.</p>}
      </div>
      <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
        <b>Box:</b> kéo chuột để vẽ khung chữ nhật.<br />
        <b>Quad:</b> bấm lần lượt 4 điểm quanh vật xiên/nghiêng.<br />
        Delete = xoá khung đã chọn.<br />
        <b>Zoom:</b> lăn chuột (tại vị trí con trỏ) hoặc nút +/−. <b>Pan:</b> Space + kéo, hoặc giữ chuột giữa + kéo.<br />
        <b>Hoàn tác:</b> Ctrl+Z | <b>Làm lại:</b> Ctrl+Y<br />
        <b>Copy/Dán khung đang chọn:</b> Ctrl+C / Ctrl+V<br />
        <b>Copy nhãn ảnh trước:</b> Alt+C<br />
        <b>Chọn class nhanh:</b> <b>Ctrl+K</b> (fuzzy search)<br />
        <b>Phím 1-9:</b> 9 class MRU (dùng gần nhất = 1)<br />
        <b>Hotkey 2 ký tự:</b> gõ nhanh 2 ký tự liên tiếp (≤500ms)
      </p>
    </div>
  );
};

export default ClassPickerPanel;

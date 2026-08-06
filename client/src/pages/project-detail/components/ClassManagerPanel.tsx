import React from 'react';
import type { ClassLabel } from '../../../types';

interface ClassManagerPanelProps {
  classes: ClassLabel[];
  onAddClass: () => void;
  onUpdateClass: (cls: ClassLabel, patch: Partial<ClassLabel>) => void;
  onRemoveClass: (cls: ClassLabel) => void;
}

export const ClassManagerPanel: React.FC<ClassManagerPanelProps> = ({
  classes,
  onAddClass,
  onUpdateClass,
  onRemoveClass,
}) => {
  return (
    <div>
      <h4>Nhãn (Classes)</h4>
      <div className="class-list-scroll">
        {classes.map((cls) => (
          <div className="class-row" key={cls.id}>
            <input type="color" value={cls.color} onChange={(e) => onUpdateClass(cls, { color: e.target.value })} />
            <input type="text" defaultValue={cls.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== cls.name && onUpdateClass(cls, { name: e.target.value.trim() })} />
            <input type="text" className="hotkey-input" maxLength={2} placeholder="—"
              defaultValue={cls.hotkey || ''}
              title="Phím tắt chữ cái để chọn nhanh nhãn này (VD: a, cd). KHÔNG dùng số 1-9 — các phím đó luôn dành riêng cho chọn nhãn dùng gần nhất (MRU), gõ số vào đây sẽ không có tác dụng."
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (cls.hotkey || '')) {
                  if (v && /^[0-9]+$/.test(v)) {
                    alert('Không thể dùng số làm phím tắt — phím 1-9 luôn dành cho "chọn nhãn dùng gần nhất" (MRU). Hãy dùng chữ cái, ví dụ: a, b, cd.');
                    e.target.value = cls.hotkey || '';
                    return;
                  }
                  onUpdateClass(cls, { hotkey: v || null });
                }
              }} />
            <button onClick={() => onRemoveClass(cls)}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn btn-outline" style={{ width: '100%', marginTop: 8 }} onClick={onAddClass}>+ Thêm nhãn</button>
    </div>
  );
};

export default ClassManagerPanel;

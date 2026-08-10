import React from 'react';
import type { ClassLabel } from '../../../types';

interface ClassManagerPanelProps {
  labelType?: string;
  classes: ClassLabel[];
  onAddClass: () => void;
  onUpdateClass: (cls: ClassLabel, patch: Partial<ClassLabel>) => void;
  onRemoveClass: (cls: ClassLabel) => void;
  onImportClasses: () => void;
  onRemoveAllClasses: () => void;
}

export const ClassManagerPanel: React.FC<ClassManagerPanelProps> = ({
  labelType,
  classes,
  onAddClass,
  onUpdateClass,
  onRemoveClass,
  onImportClasses,
  onRemoveAllClasses,
}) => {
  return (
    <div>
      <h4>{labelType === 'text_rec' ? 'TẬP KÝ TỰ (CHARSET)' : 'Nhãn (Classes)'}</h4>
      
      {labelType === 'text_rec' ? (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8,
          background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8,
          minHeight: 60, maxHeight: 200, overflowY: 'auto'
        }}>
          {classes.length === 0 ? (
            <span style={{ fontSize: 13, color: '#94a3b8' }}>Chưa có ký tự nào trong Charset.</span>
          ) : (
            classes.sort((a,b) => a.name.localeCompare(b.name)).map(cls => (
              <span key={cls.id} style={{
                background: '#e2e8f0', color: '#334155', padding: '4px 8px',
                borderRadius: 4, fontSize: 14, fontWeight: 600, fontFamily: 'monospace',
                border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: 4
              }}>
                {cls.name}
                <button onClick={() => onRemoveClass(cls)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, marginLeft: 2, fontSize: 12 }}>✕</button>
              </span>
            ))
          )}
        </div>
      ) : (
        <div className="class-list-scroll">
          {classes.map((cls) => (
            <div className="class-row" key={cls.id}>
              <input type="color" value={cls.color} onChange={(e) => onUpdateClass(cls, { color: e.target.value })} />
              <input type="text" defaultValue={cls.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== cls.name && onUpdateClass(cls, { name: e.target.value.trim() })} />
              <input type="text" className="hotkey-input" maxLength={2} placeholder="—"
                defaultValue={cls.hotkey || ''}
                title="Phím tắt để chọn nhanh nhãn này (VD: a, 1, cd, 2b). Tối đa 2 ký tự."
                onFocus={(e) => e.target.select()}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (cls.hotkey || '')) {
                    if (v && !/^[a-zA-Z0-9]{1,2}$/.test(v)) {
                      alert('Phím tắt chỉ được chứa chữ cái hoặc số, tối đa 2 ký tự (ví dụ: a, 1, cd, 2b).');
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
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="btn btn-outline" style={{ flex: 1, padding: '6px 2px', fontSize: 13 }} onClick={onAddClass}>+ Thêm nhãn</button>
        <button className="btn btn-outline" style={{ flex: 1, padding: '6px 2px', fontSize: 13 }} onClick={onImportClasses}>Import / Copy</button>
      </div>
      {classes.length > 0 && (
        <button 
          className="btn btn-outline" 
          onClick={onRemoveAllClasses}
          style={{ 
            width: '100%', 
            marginTop: 6, 
            padding: '6px 2px', 
            fontSize: 13, 
            color: '#c0392b', 
            borderColor: '#f5c6cb',
            backgroundColor: '#fff5f5',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#fdf2f2';
            e.currentTarget.style.color = '#e74c3c';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#fff5f5';
            e.currentTarget.style.color = '#c0392b';
          }}
        >
          ✕ Xoá tất cả nhãn
        </button>
      )}
    </div>
  );
};

export default ClassManagerPanel;

import React, { RefObject } from 'react';
import type { ClassLabel } from '../../../types';

interface QuickClassSwitcherModalProps {
  showSwitcher: boolean;
  switcherQuery: string;
  switcherIdx: number;
  switcherResults: ClassLabel[];
  mruClassIds: string[];
  switcherInputRef: RefObject<HTMLInputElement>;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onIdxChange: (idx: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onApplyClass: (classId: string) => void;
}

export const QuickClassSwitcherModal: React.FC<QuickClassSwitcherModalProps> = ({
  showSwitcher,
  switcherQuery,
  switcherIdx,
  switcherResults,
  mruClassIds,
  switcherInputRef,
  onClose,
  onQueryChange,
  onIdxChange,
  onKeyDown,
  onApplyClass,
}) => {
  if (!showSwitcher) return null;

  return (
    <div className="class-switcher-overlay" onClick={onClose}>
      <div className="class-switcher-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={switcherInputRef}
          className="class-switcher-input"
          value={switcherQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Tìm nhãn... (↑↓ di chuyển, Enter chọn, Esc đóng)"
        />
        <div className="class-switcher-list">
          {switcherResults.map((c, i) => {
            const mi = mruClassIds.indexOf(c.id);
            return (
              <div
                key={c.id}
                className={`class-switcher-row${i === switcherIdx ? ' selected' : ''}`}
                onClick={() => onApplyClass(c.id)}
                onMouseEnter={() => onIdxChange(i)}
              >
                <span style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: c.color, display: 'inline-block' }} />
                <span style={{ flex: 1 }}>{c.name}</span>
                {mi >= 0 && mi < 9 && <span className="key" style={{ fontSize: 11 }}>{mi + 1}</span>}
                {c.hotkey && <span className="key custom" style={{ fontSize: 11 }}>{c.hotkey}</span>}
              </div>
            );
          })}
          {switcherResults.length === 0 && (
            <div style={{ padding: '10px 16px', color: '#888', fontSize: 13 }}>Không tìm thấy nhãn nào</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickClassSwitcherModal;

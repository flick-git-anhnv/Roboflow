import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Circle, PlayCircle, CheckCircle } from 'lucide-react';
import type { ProjectStatus } from '../types';
import { api } from '../api';

export const STATUS_META: Record<ProjectStatus, { label: string; icon: React.ReactNode }> = {
  planning: { label: 'Kế hoạch', icon: <Circle size={8} fill="currentColor" /> },
  active:   { label: 'Đang làm', icon: <PlayCircle size={8} /> },
  done:     { label: 'Hoàn tất', icon: <CheckCircle size={8} /> },
};

interface Props {
  projectId: string;
  status: ProjectStatus;
  onChanged?: (newStatus: ProjectStatus) => void;
}

export default function StatusDropdown({ projectId, status, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<ProjectStatus>(status);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const badgeRef = useRef<HTMLSpanElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCurrent(status); }, [status]);

  // Đóng khi click ngoài
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      // Không đóng nếu click vào chính badge hoặc trong dropdown menu
      if (badgeRef.current && badgeRef.current.contains(e.target as Node)) return;
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!open && badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX,
      });
    }
    setOpen(o => !o);
  };

  const handleSelect = async (e: React.MouseEvent, newStatus: ProjectStatus) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[StatusDropdown] handleSelect clicked. newStatus:', newStatus, 'projectId:', projectId);
    setOpen(false);
    if (newStatus === current) {
      console.log('[StatusDropdown] status is already', newStatus, '- skipping API call');
      return;
    }
    const prev = current;
    setCurrent(newStatus); // optimistic
    try {
      console.log('[StatusDropdown] calling api.updateProject...');
      const updated = await api.updateProject(projectId, { status: newStatus });
      console.log('[StatusDropdown] api.updateProject response:', updated);
      const finalStatus: ProjectStatus = (updated.status as ProjectStatus) ?? newStatus;
      setCurrent(finalStatus);
      onChanged?.(finalStatus);
    } catch (err) {
      console.error('[StatusDropdown] PATCH failed:', err);
      setCurrent(prev); // rollback
    }
  };

  const meta = STATUS_META[current];

  return (
    <>
      <span
        ref={badgeRef}
        className={`status-badge ${current}`}
        style={{ cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}
        onClick={handleBadgeClick}
      >
        {meta.icon} {meta.label}
        <span style={{ opacity: 0.5, fontSize: 9, marginLeft: 3 }}>▾</span>
      </span>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: dropPos.top,
            left: dropPos.left,
            zIndex: 9999,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            minWidth: 148,
            overflow: 'hidden',
          }}
        >
          {(Object.entries(STATUS_META) as [ProjectStatus, typeof STATUS_META[ProjectStatus]][]).map(([s, m]) => (
            <div
              key={s}
              onClick={(e) => handleSelect(e, s)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', cursor: 'pointer', gap: 8,
                background: s === current ? 'var(--navy-pale)' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-pale)')}
              onMouseLeave={e => (e.currentTarget.style.background = s === current ? 'var(--navy-pale)' : 'transparent')}
            >
              <span className={`status-badge ${s}`} style={{ pointerEvents: 'none' }}>
                {m.icon} {m.label}
              </span>
              {s === current && (
                <CheckCircle size={12} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

import React, { useState } from 'react';

interface PaginationControlsProps {
  page: number;
  pageCount: number;
  onChange: (p: number) => void;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({ page, pageCount, onChange }) => {
  const [jumpPage, setJumpPage] = useState('');

  if (pageCount <= 1) return null;

  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const items = Array.from(pages).filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const rendered: (number | 'ellipsis')[] = [];
  items.forEach((p, i) => {
    if (i > 0 && p - items[i - 1] > 1) rendered.push('ellipsis');
    rendered.push(p);
  });

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseInt(jumpPage, 10);
    if (!isNaN(target)) {
      const validPage = Math.max(1, Math.min(pageCount, target));
      onChange(validPage);
      setJumpPage('');
    }
  };

  return (
    <div className="pagination">
      <button className="btn btn-outline" onClick={() => onChange(page - 1)} disabled={page <= 1}>‹ Trước</button>
      {rendered.map((p, i) => p === 'ellipsis' ? (
        <span key={`e${i}`} className="pagination-ellipsis">…</span>
      ) : (
        <button key={p} className={`pagination-page ${p === page ? 'active' : ''}`} onClick={() => onChange(p)}>{p}</button>
      ))}
      <button className="btn btn-outline" onClick={() => onChange(page + 1)} disabled={page >= pageCount}>Sau ›</button>

      <form className="pagination-jump" onSubmit={handleJump}>
        <span className="pagination-jump-label">Đến trang:</span>
        <input
          type="number"
          min={1}
          max={pageCount}
          value={jumpPage}
          onChange={(e) => setJumpPage(e.target.value)}
          placeholder={String(page)}
          className="pagination-jump-input"
          aria-label="Nhập số trang"
        />
        <button type="submit" className="btn btn-outline pagination-jump-btn">
          Đi
        </button>
      </form>
    </div>
  );
};

export default PaginationControls;

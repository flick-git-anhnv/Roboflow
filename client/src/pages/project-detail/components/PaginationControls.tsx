import React from 'react';

interface PaginationControlsProps {
  page: number;
  pageCount: number;
  onChange: (p: number) => void;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({ page, pageCount, onChange }) => {
  if (pageCount <= 1) return null;

  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const items = Array.from(pages).filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const rendered: (number | 'ellipsis')[] = [];
  items.forEach((p, i) => {
    if (i > 0 && p - items[i - 1] > 1) rendered.push('ellipsis');
    rendered.push(p);
  });

  return (
    <div className="pagination">
      <button className="btn btn-outline" onClick={() => onChange(page - 1)} disabled={page <= 1}>‹ Trước</button>
      {rendered.map((p, i) => p === 'ellipsis' ? (
        <span key={`e${i}`} className="pagination-ellipsis">…</span>
      ) : (
        <button key={p} className={`pagination-page ${p === page ? 'active' : ''}`} onClick={() => onChange(p)}>{p}</button>
      ))}
      <button className="btn btn-outline" onClick={() => onChange(page + 1)} disabled={page >= pageCount}>Sau ›</button>
    </div>
  );
};

export default PaginationControls;

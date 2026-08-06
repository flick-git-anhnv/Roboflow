import React from 'react';
import { Link } from 'react-router-dom';
import type { ClassLabel, ImageItem, Split } from '../../../types';
import { REVIEW_LABEL } from '../types';

interface ImageTileProps {
  img: ImageItem;
  projectId: string;
  isSelected: boolean;
  classById: Map<string, ClassLabel>;
  onToggleSelect: (id: string, e: React.MouseEvent | React.ChangeEvent) => void;
  onChangeSplit: (img: ImageItem, split: Split, e: React.MouseEvent) => void;
  onRemoveImage: (img: ImageItem, e: React.MouseEvent) => void;
}

export const ImageTile: React.FC<ImageTileProps> = ({
  img,
  projectId,
  isSelected,
  classById,
  onToggleSelect,
  onChangeSplit,
  onRemoveImage,
}) => {
  return (
    <Link to={`/projects/${projectId}/annotate/${img.id}`}
      className={`image-tile ${img.status === 'labeled' ? 'labeled' : ''}`}>
      {isSelected && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(37,28,83,0.35)',
          border: '2px solid #251C53', borderRadius: 'inherit', pointerEvents: 'none', zIndex: 1,
        }} />
      )}
      <label
        style={{ position: 'absolute', top: 4, left: 4, zIndex: 3, cursor: 'pointer', lineHeight: 0 }}
        title="Chọn ảnh này"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(img.id, e)}
          onClick={(e) => e.stopPropagation()}
          style={{ width: 15, height: 15, cursor: 'pointer' }}
        />
      </label>
      <img src={img.thumbnail_url || `/uploads/${projectId}/${img.filename}`} alt={img.original_name} loading="lazy" />
      <span className={`badge ${img.status === 'labeled' ? 'labeled' : ''}`}>
        {img.status === 'labeled' ? 'Đã gán' : 'Chưa gán'}
      </span>
      {img.completed_at && (
        <span
          title={`Hoàn thành lúc ${new Date(img.completed_at).toLocaleString('vi-VN')}`}
          style={{
            position: 'absolute',
            bottom: 24,
            right: 4,
            fontSize: 10,
            padding: '1px 5px',
            borderRadius: 4,
            color: '#fff',
            background: '#1b5e20',
            fontWeight: 600,
          }}
        >
          ✓ Xong
        </span>
      )}
      {img.review_status && img.review_status !== 'draft' && (
        <span
          className={`review-badge review-${img.review_status}`}
          title={img.review_comment || ''}
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 4,
            color: '#fff',
            background:
              img.review_status === 'approved' ? '#2e7d32' :
              img.review_status === 'rejected' ? '#F05922' : '#4A3F8C',
          }}
        >
          {REVIEW_LABEL[img.review_status]}
        </span>
      )}
      <span className="split-badge"
        onClick={(e) => {
          e.preventDefault();
          const order: Split[] = ['train', 'valid', 'test'];
          const next = order[(order.indexOf(img.split) + 1) % order.length];
          onChangeSplit(img, next, e);
        }}
        title="Bấm để đổi tập train/valid/test">
        {img.split}
      </span>
      <button className="delete-btn" onClick={(e) => onRemoveImage(img, e)} title="Xoá ảnh">✕</button>
      {img.class_ids && img.class_ids.length > 0 && (
        <span className="class-dots" title={img.class_ids.map((id) => classById.get(id)?.name).filter(Boolean).join(', ')}>
          {img.class_ids.slice(0, 5).map((id) => (
            <i key={id} style={{ background: classById.get(id)?.color || '#999' }} />
          ))}
        </span>
      )}
    </Link>
  );
};

export default ImageTile;

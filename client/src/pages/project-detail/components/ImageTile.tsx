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
      <div className="tile-controls">
        <label
          style={{ cursor: 'pointer', lineHeight: 0, display: 'flex', alignItems: 'center' }}
          title="Chọn ảnh này"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onToggleSelect(img.id, e)}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 14, height: 14, cursor: 'pointer', margin: 0 }}
          />
        </label>
        <span className={`badge ${img.status === 'labeled' ? 'labeled' : ''}`} style={{ position: 'static' }}>
          {img.status === 'labeled' ? 'Đã gán' : 'Chưa gán'}
        </span>
        {img.review_status && img.review_status !== 'draft' && (
          <span
            className={`review-badge review-${img.review_status}`}
            title={img.review_comment || ''}
          >
            {REVIEW_LABEL[img.review_status]}
          </span>
        )}
      </div>
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'relative',
          aspectRatio: `${img.width || 4} / ${img.height || 3}`,
          maxWidth: '100%',
          maxHeight: '100%',
        }}>
          <img
            src={img.thumbnail_url || `/uploads/${projectId}/${img.filename}`}
            alt={img.original_name}
            loading="lazy"
            style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
          />
          {img.annotations && img.annotations.length > 0 && (
            <svg
              viewBox={`0 0 ${img.width || 100} ${img.height || 100}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
            >
              {img.annotations.map((ann, idx) => {
                const cls = classById.get(ann.class_id);
                const color = cls?.color || '#F05922';
                return (
                  <rect
                    key={idx}
                    x={ann.x}
                    y={ann.y}
                    width={ann.w}
                    height={ann.h}
                    fill="none"
                    stroke={color}
                    strokeWidth={Math.max(2, (img.width || 640) / 180)} // Scale stroke thickness
                  />
                );
              })}
            </svg>
          )}
        </div>
      </div>
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
      {img.completed_at && (
        <span
          title={`Hoàn thành lúc ${new Date(img.completed_at).toLocaleString('vi-VN')}`}
          style={{
            position: 'absolute',
            bottom: 4,
            right: 32,
            fontSize: '9px',
            fontWeight: 600,
            padding: '1px 4px',
            borderRadius: 3,
            color: '#fff',
            background: '#2e7d32',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 1px rgba(0,0,0,0.3)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            zIndex: 3,
          }}
        >
          ✓ Xong
        </span>
      )}
      {img.class_ids && img.class_ids.length > 0 && (
        <div
          title={img.class_ids.map((id) => classById.get(id)?.name).filter(Boolean).join(', ')}
          style={{
            position: 'absolute',
            bottom: 4,
            left: 4,
            right: img.completed_at ? 78 : 32,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 3,
            zIndex: 3,
          }}
        >
          {img.class_ids.map((id, index) => {
            const cls = classById.get(id);
            if (!cls) return null;
            return (
              <span
                key={`${id}-${index}`}
                style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  padding: '1px 4px',
                  borderRadius: 3,
                  color: '#fff',
                  background: cls.color || '#999',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 1px rgba(0,0,0,0.3)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              >
                {cls.name}
              </span>
            );
          })}
        </div>
      )}
    </Link>
  );
};

export default ImageTile;

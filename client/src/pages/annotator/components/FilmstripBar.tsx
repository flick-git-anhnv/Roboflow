import React, { RefObject } from 'react';
import type { ImageItem } from '../../../types';

interface FilmstripBarProps {
  showFilmstrip: boolean;
  filmstripRef: RefObject<HTMLDivElement>;
  images: ImageItem[];
  currentImageId?: string;
  onGoToImageId: (id: string) => void;
}

export const FilmstripBar: React.FC<FilmstripBarProps> = ({
  showFilmstrip,
  filmstripRef,
  images,
  currentImageId,
  onGoToImageId,
}) => {
  if (!showFilmstrip) return null;

  return (
    <div className="filmstrip" ref={filmstripRef}>
      {images.map((img) => {
        const isActive = img.id === currentImageId;
        // Badge priority: review_status > completed_at > status (labeled/unlabeled)
        let badgeBg = '#555';
        let badgeText = 'Chưa gán';
        if (img.status === 'labeled') { badgeBg = '#251C53'; badgeText = 'Đã gán'; }
        if (img.completed_at) { badgeBg = '#2e7d32'; badgeText = '✓ Xong'; }
        if (img.review_status === 'in_review') { badgeBg = '#4A3F8C'; badgeText = 'Chờ duyệt'; }
        if (img.review_status === 'approved') { badgeBg = '#2e7d32'; badgeText = '✓ Duyệt'; }
        if (img.review_status === 'rejected') { badgeBg = '#F05922'; badgeText = 'Từ chối'; }

        return (
          <div
            key={img.id}
            data-id={img.id}
            className={`filmstrip-thumb${isActive ? ' active' : ''}`}
            onClick={() => onGoToImageId(img.id)}
            title={img.original_name}
          >
            <img
              src={`/api/images/${img.id}/thumb?size=80`}
              alt={img.original_name}
              loading="lazy"
              width={80}
              height={80}
            />
            <span className="filmstrip-badge" style={{ background: badgeBg }}>{badgeText}</span>
          </div>
        );
      })}
    </div>
  );
};

export default FilmstripBar;

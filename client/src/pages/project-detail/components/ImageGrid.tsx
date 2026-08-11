import React from 'react';
import type { ClassLabel, ImageItem, Split } from '../../../types';
import ImageTile from './ImageTile';

interface ImageGridProps {
  images: ImageItem[];
  filteredImages: ImageItem[];
  pagedImages: ImageItem[];
  projectId: string;
  selectedIds: Set<string>;
  classById: Map<string, ClassLabel>;
  onToggleSelect: (id: string, e: React.MouseEvent | React.ChangeEvent) => void;
  onChangeSplit: (img: ImageItem, split: Split, e: React.MouseEvent) => void;
  onRemoveImage: (img: ImageItem, e: React.MouseEvent) => void;
  gridSize?: 'small' | 'medium' | 'large';
  filterQuery?: string;
}

export const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  filteredImages,
  pagedImages,
  projectId,
  selectedIds,
  classById,
  onToggleSelect,
  onChangeSplit,
  onRemoveImage,
  gridSize = 'medium',
  filterQuery,
}) => {
  if (images.length === 0) {
    return <div className="empty-state card">Chưa có ảnh nào trong project này.</div>;
  }

  if (filteredImages.length === 0) {
    return <div className="empty-state card">Không có ảnh nào khớp bộ lọc hiện tại.</div>;
  }

  return (
    <div className={`image-grid grid-${gridSize}`}>
      {pagedImages.map((img) => (
        <ImageTile
          key={img.id}
          img={img}
          projectId={projectId}
          isSelected={selectedIds.has(img.id)}
          classById={classById}
          onToggleSelect={onToggleSelect}
          onChangeSplit={onChangeSplit}
          onRemoveImage={onRemoveImage}
          filterQuery={filterQuery}
        />
      ))}
    </div>
  );
};

export default ImageGrid;

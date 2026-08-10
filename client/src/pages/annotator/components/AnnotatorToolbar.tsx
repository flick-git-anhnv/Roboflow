import React from 'react';
import { Link } from 'react-router-dom';
import type { ImageItem, ImageWithAnnotations } from '../../../types';
import type { Tool } from '../types';

const REVIEW_LABEL: Record<string, string> = {
  draft: 'Nháp',
  in_review: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
};

interface AnnotatorToolbarProps {
  projectId?: string;
  currentIndex: number;
  totalImages: number;
  currentImage: ImageWithAnnotations;
  prevImageItem: ImageItem | null;
  tool: Tool;
  selectedId: string | null;
  hasClipboard: boolean;
  undoSize: number;
  redoSize: number;
  copyingLabels: boolean;
  zoom: number;
  showFilmstrip: boolean;
  saveState: 'saved' | 'dirty' | 'saving';
  doneBusy: boolean;
  reviewBusy: boolean;
  canReview: boolean;
  onGoTo: (delta: number) => void;
  onSetTool: (tool: Tool) => void;
  onCancelDrawing: () => void;
  onCopySelectedBox: () => void;
  onPasteBox: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopyLabelsFromPrev: () => void;
  onSetZoomClamped: (z: number) => void;
  onSetZoom: (z: number) => void;
  onToggleFilmstrip: () => void;
  onHandleMarkDone: () => void;
  onHandleUnmarkDone: () => void;
  onSubmitReview: () => void;
  onApproveReview: () => void;
  onRejectReview: () => void;
  onOpenPromptModal?: () => void;
  onOpenAutoLabel?: () => void;
  onDeleteImage?: () => void;
}

export const AnnotatorToolbar: React.FC<AnnotatorToolbarProps> = ({
  projectId,
  currentIndex,
  totalImages,
  currentImage,
  prevImageItem,
  tool,
  selectedId,
  hasClipboard,
  undoSize,
  redoSize,
  copyingLabels,
  zoom,
  showFilmstrip,
  saveState,
  doneBusy,
  reviewBusy,
  canReview,
  onGoTo,
  onSetTool,
  onCancelDrawing,
  onCopySelectedBox,
  onPasteBox,
  onUndo,
  onRedo,
  onCopyLabelsFromPrev,
  onSetZoomClamped,
  onSetZoom,
  onToggleFilmstrip,
  onHandleMarkDone,
  onHandleUnmarkDone,
  onSubmitReview,
  onApproveReview,
  onRejectReview,
  onOpenPromptModal,
  onOpenAutoLabel,
  onDeleteImage,
}) => {
  const isCopyPrevDisabled = !prevImageItem || prevImageItem.status === 'unlabeled' || copyingLabels;

  const [inputVal, setInputVal] = React.useState(String(currentIndex + 1));

  React.useEffect(() => {
    setInputVal(String(currentIndex + 1));
  }, [currentIndex]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputVal(e.target.value);
  };

  const commitIndex = () => {
    const parsed = parseInt(inputVal, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalImages) {
      const delta = (parsed - 1) - currentIndex;
      if (delta !== 0) {
        onGoTo(delta);
      }
    } else {
      setInputVal(String(currentIndex + 1));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const copyImageToClipboard = async () => {
    const imageUrl = `/uploads/${projectId}/${currentImage.filename}`;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      let copyBlob = blob;
      if (blob.type !== 'image/png') {
        const img = new Image();
        img.src = imageUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (pngBlob) {
            copyBlob = pngBlob;
          }
        }
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          [copyBlob.type]: copyBlob
        })
      ]);
      alert('Đã copy ảnh vào clipboard!');
    } catch (err: any) {
      alert('Không thể copy ảnh: ' + err.message);
    }
  };

  return (
    <div className="annotator-toolbar">
      <Link to={`/projects/${projectId}`} className="btn btn-outline">← Quay lại project</Link>
      <button className="btn btn-outline" onClick={() => onGoTo(-1)} disabled={currentIndex <= 0}>‹ Ảnh trước</button>
      <button className="btn btn-outline" onClick={() => onGoTo(1)} disabled={currentIndex < 0 || currentIndex >= totalImages - 1}>Ảnh sau ›</button>
      <button className="btn btn-outline" onClick={copyImageToClipboard} title="Copy ảnh hiện tại vào clipboard" style={{ fontSize: 12, padding: '2px 8px' }}>📸 Copy ảnh</button>
      <button className="btn btn-outline" onClick={onDeleteImage} title="Xoá ảnh hiện tại" style={{ fontSize: 12, padding: '2px 8px', color: '#dc2626', borderColor: '#dc2626' }}>🗑️ Xoá ảnh</button>

      <div className="tool-toggle">
        <button
          className={`tool-btn ${tool === 'bbox' ? 'active' : ''}`}
          onClick={() => { onSetTool('bbox'); onCancelDrawing(); }}
          title="Kéo thả để vẽ khung chữ nhật"
        >
          ▭ Box
        </button>
        <button
          className={`tool-btn ${tool === 'quad' ? 'active' : ''}`}
          onClick={() => onSetTool('quad')}
          title="Chấm 4 điểm — phù hợp cho biển số bị xiên/nghiêng"
        >
          ◈ Quad
        </button>
        <button
          className={`tool-btn ${tool === 'sam_smart_polygon' ? 'active' : ''}`}
          onClick={() => onSetTool('sam_smart_polygon')}
          title="AI Smart Polygon — Click 1 lần để SAM tự động phân vùng vật thể"
          style={{ background: tool === 'sam_smart_polygon' ? '#8b5cf6' : undefined, color: tool === 'sam_smart_polygon' ? '#fff' : undefined }}
        >
          🪄 Smart SAM
        </button>
        <button
          className="tool-btn"
          onClick={onOpenAutoLabel}
          title="Auto-Label hàng loạt bằng Model đã train (YOLOv8)"
          style={{ background: '#2e7d32', color: '#fff' }}
        >
          🤖 Auto Label
        </button>
        <button
          className="tool-btn"
          onClick={onOpenPromptModal}
          title="Auto-Label hàng loạt bằng Text Prompt (Grounding DINO / Zero-shot)"
          style={{ background: '#3b82f6', color: '#fff' }}
        >
          💬 Auto-Prompt
        </button>
      </div>



      {/* Copy/Dán 1 box đang chọn (Ctrl+C / Ctrl+V) */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className="btn btn-outline"
          onClick={onCopySelectedBox}
          disabled={!selectedId}
          title="Copy khung đang chọn (Ctrl+C)"
          style={{ fontSize: 12, padding: '2px 8px', opacity: !selectedId ? 0.45 : 1 }}
        >
          ⧉ Copy (Ctrl+C)
        </button>
        <button
          className="btn btn-outline"
          onClick={onPasteBox}
          disabled={!hasClipboard}
          title="Dán khung đã copy, lệch nhẹ vị trí để dễ nhận ra (Ctrl+V)"
          style={{ fontSize: 12, padding: '2px 8px', opacity: !hasClipboard ? 0.45 : 1 }}
        >
          📄 Dán (Ctrl+V)
        </button>
      </div>

      {/* Undo/Redo buttons */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className="btn btn-outline"
          onClick={onUndo}
          disabled={undoSize === 0}
          title="Hoàn tác thao tác vừa rồi (Ctrl+Z)"
          style={{ fontSize: 12, padding: '2px 8px', opacity: undoSize === 0 ? 0.45 : 1 }}
        >
          ↩ Hoàn tác{undoSize > 0 ? ` (${undoSize})` : ''}
        </button>
        <button
          className="btn btn-outline"
          onClick={onRedo}
          disabled={redoSize === 0}
          title="Làm lại thao tác vừa hoàn tác (Ctrl+Y / Ctrl+Shift+Z)"
          style={{ fontSize: 12, padding: '2px 8px', opacity: redoSize === 0 ? 0.45 : 1 }}
        >
          ↪ Làm lại{redoSize > 0 ? ` (${redoSize})` : ''}
        </button>
      </div>

      {/* Copy labels from previous image button */}
      <button
        className="btn btn-outline"
        onClick={onCopyLabelsFromPrev}
        disabled={isCopyPrevDisabled}
        title="Copy toàn bộ nhãn từ ảnh liền trước sang ảnh này (Alt+C). Disable khi ảnh trước chưa có nhãn."
        style={{ fontSize: 12, padding: '2px 8px', opacity: isCopyPrevDisabled ? 0.45 : 1 }}
      >
        {copyingLabels ? '⏳ Đang copy...' : '📋 Copy nhãn ảnh trước (Alt+C)'}
      </button>

      <div className="zoom-controls">
        <button className="btn btn-outline" onClick={() => onSetZoomClamped(zoom / 1.25)} disabled={zoom <= 1} title="Thu nhỏ">−</button>
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button className="btn btn-outline" onClick={() => onSetZoomClamped(zoom * 1.25)} disabled={zoom >= 8} title="Phóng to">+</button>
        <button className="btn btn-outline" onClick={() => onSetZoom(1)} disabled={zoom === 1} title="Về vừa khung hình">⤢ Fit</button>
      </div>

      {/* Filmstrip toggle */}
      <button
        className="btn btn-outline"
        onClick={onToggleFilmstrip}
        title={showFilmstrip ? 'Ẩn dải ảnh (filmstrip)' : 'Hiện dải ảnh (filmstrip)'}
        style={{ fontSize: 12, padding: '2px 8px' }}
      >
        {showFilmstrip ? '▼ Dải ảnh' : '▲ Dải ảnh'}
      </button>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          type="text"
          value={inputVal}
          onChange={handleInputChange}
          onBlur={commitIndex}
          onKeyDown={handleKeyDown}
          style={{
            width: 48,
            height: 24,
            textAlign: 'center',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: 12,
            padding: '0 4px',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: 13, color: '#666' }}>/ {totalImages} — {currentImage.original_name}</span>
      </div>
      <span className={`save-status ${saveState}`}>
        {saveState === 'saved' ? '✓ Đã lưu' : saveState === 'saving' ? 'Đang lưu...' : 'Chưa lưu...'}
      </span>

      {/* Done status button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        {currentImage.completed_at ? (
          <button
            className="btn"
            disabled={doneBusy}
            onClick={onHandleUnmarkDone}
            title="Bấm để bỏ đánh dấu xong (phím D)"
            style={{ background: '#2e7d32', color: '#fff', border: 'none', fontWeight: 600 }}
          >
            ✓ Đã xong
          </button>
        ) : (
          <button
            className="btn btn-outline"
            disabled={doneBusy}
            onClick={onHandleMarkDone}
            title="Xác nhận đã gán nhãn xong ảnh này và chuyển tiếp (phím Enter hoặc D)"
          >
            ☐ Xong (Enter)
          </button>
        )}
      </div>

      <div className="review-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {currentImage.review_status && currentImage.review_status !== 'draft' && (
          <span style={{
            fontSize: 12, padding: '3px 8px', borderRadius: 4, color: '#fff',
            background: currentImage.review_status === 'approved' ? '#2e7d32' :
              currentImage.review_status === 'rejected' ? '#F05922' : '#4A3F8C',
          }}
            title={currentImage.review_comment || ''}>
            {REVIEW_LABEL[currentImage.review_status]}
          </span>
        )}
        {!canReview && (!currentImage.review_status || currentImage.review_status === 'draft' || currentImage.review_status === 'rejected') && (
          <button className="btn btn-outline" disabled={reviewBusy} onClick={onSubmitReview}>
            📤 Gửi duyệt
          </button>
        )}
        {canReview && currentImage.review_status === 'in_review' && (
          <>
            <button className="btn btn-outline" disabled={reviewBusy} onClick={onApproveReview}>✓ Duyệt</button>
            <button className="btn btn-outline" disabled={reviewBusy} onClick={onRejectReview}>✕ Từ chối</button>
          </>
        )}
      </div>
    </div>
  );
};

export default AnnotatorToolbar;

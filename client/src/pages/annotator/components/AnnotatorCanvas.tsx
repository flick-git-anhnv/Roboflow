import React, { RefObject } from 'react';

interface AnnotatorCanvasProps {
  spaceHeld: boolean;
  isPanning: boolean;
  imgEl: HTMLImageElement | null;
  containerRef: RefObject<HTMLDivElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const AnnotatorCanvas: React.FC<AnnotatorCanvasProps> = ({
  spaceHeld,
  isPanning,
  imgEl,
  containerRef,
  canvasRef,
  onMouseDown,
  onMouseMove,
  onContextMenu,
}) => {
  return (
    <div
      className={`canvas-stage ${spaceHeld ? 'pan-ready' : ''} ${isPanning ? 'panning' : ''}`}
      ref={containerRef}
    >
      {!imgEl && <span className="canvas-loading">Đang tải ảnh...</span>}
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onContextMenu={onContextMenu}
      />
    </div>
  );
};

export default AnnotatorCanvas;

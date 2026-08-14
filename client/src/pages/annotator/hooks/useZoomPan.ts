import { useEffect, useRef, useState } from 'react';
import type { ImageWithAnnotations } from '../../../types';
import { clamp } from '../utils';

export function useZoomPan(
  image: ImageWithAnnotations | null,
  containerRef: React.RefObject<HTMLDivElement>,
) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);

  const setZoomClamped = (z: number) => setZoom(clamp(z, 1, 8));

  // Reset zoom and scroll on image change
  useEffect(() => {
    setZoom(1);
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
    }
  }, [image?.id, containerRef]);

  // Non-passive wheel event listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const canvas = container.querySelector('canvas');
      const canvasRect = canvas ? canvas.getBoundingClientRect() : rect;

      const mouseCanvasX = e.clientX - canvasRect.left;
      const mouseCanvasY = e.clientY - canvasRect.top;

      const canvasViewportLeft = canvasRect.left - rect.left;
      const canvasViewportTop = canvasRect.top - rect.top;

      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const currentZoom = zoomRef.current;
      const newZoom = clamp(currentZoom * factor, 1, 8);
      if (newZoom === currentZoom) return;

      const ratio = newZoom / currentZoom;
      pendingScrollRef.current = {
        left: Math.max(0, container.scrollLeft + mouseCanvasX * (ratio - 1)),
        top: Math.max(0, container.scrollTop + mouseCanvasY * (ratio - 1)),
      };
      setZoom(newZoom);
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, [image, containerRef]);

  // Apply pending scroll after zoom updates canvas
  useEffect(() => {
    if (pendingScrollRef.current && containerRef.current) {
      const left = pendingScrollRef.current.left;
      const top = pendingScrollRef.current.top;
      pendingScrollRef.current = null;
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollLeft = left;
          containerRef.current.scrollTop = top;
        }
      });
    }
  }, [zoom, containerRef]);

  // Spacebar listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setSpaceHeld(true); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceHeld(false); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const activePanCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (activePanCleanupRef.current) {
        activePanCleanupRef.current();
      }
    };
  }, []);

  const startPan = (e: React.MouseEvent) => {
    if (activePanCleanupRef.current) {
      activePanCleanupRef.current();
    }
    const container = containerRef.current;
    if (!container) return;
    const startScrollLeft = container.scrollLeft, startScrollTop = container.scrollTop;
    const startClientX = e.clientX, startClientY = e.clientY;
    setIsPanning(true);
    const move = (ev: MouseEvent) => {
      container.scrollLeft = startScrollLeft - (ev.clientX - startClientX);
      container.scrollTop = startScrollTop - (ev.clientY - startClientY);
    };
    const up = () => {
      setIsPanning(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      activePanCleanupRef.current = null;
    };
    activePanCleanupRef.current = up;
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return {
    zoom,
    setZoom,
    zoomRef,
    spaceHeld,
    isPanning,
    pendingScrollRef,
    setZoomClamped,
    startPan,
  };
}

export default useZoomPan;

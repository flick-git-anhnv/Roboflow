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

  // Non-passive wheel event listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const contentX = e.clientX - rect.left + container.scrollLeft;
      const contentY = e.clientY - rect.top + container.scrollTop;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const currentZoom = zoomRef.current;
      const newZoom = clamp(currentZoom * factor, 1, 8);
      if (newZoom === currentZoom) return;
      const ratio = newZoom / currentZoom;
      pendingScrollRef.current = {
        left: contentX * ratio - (e.clientX - rect.left),
        top: contentY * ratio - (e.clientY - rect.top),
      };
      setZoom(newZoom);
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, [image, containerRef]);

  // Apply pending scroll after zoom updates canvas
  useEffect(() => {
    if (pendingScrollRef.current && containerRef.current) {
      containerRef.current.scrollLeft = pendingScrollRef.current.left;
      containerRef.current.scrollTop = pendingScrollRef.current.top;
      pendingScrollRef.current = null;
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

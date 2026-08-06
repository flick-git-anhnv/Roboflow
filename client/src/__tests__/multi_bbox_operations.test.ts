import { describe, it, expect } from 'vitest';
import { clamp } from '../pages/annotator/utils';

// Helper function duplicating the exact mathematical logic for resize group
function resizeBoxes(
  groupOrig: any[],
  orig: any,
  handle: string | number,
  x: number,
  y: number,
  imageW: number,
  imageH: number
) {
  let pnx = orig.x, pny = orig.y, pnw = orig.w, pnh = orig.h;

  if (handle === 'se') { pnw = x - orig.x; pnh = y - orig.y; }
  else if (handle === 'ne') { pnw = x - orig.x; pnh = orig.y + orig.h - y; pny = y; }
  else if (handle === 'sw') { pnw = orig.x + orig.w - x; pnh = y - orig.y; pnx = x; }
  else if (handle === 'nw') { pnw = orig.x + orig.w - x; pnh = orig.y + orig.h - y; pnx = x; pny = y; }
  if (pnw < 0) { pnx += pnw; pnw = -pnw; }
  if (pnh < 0) { pny += pnh; pnh = -pnh; }

  const scaleX = orig.w > 0 ? pnw / orig.w : 1;
  const scaleY = orig.h > 0 ? pnh / orig.h : 1;

  let ax = orig.x;
  let ay = orig.y;
  if (handle === 'se') { ax = orig.x; ay = orig.y; }
  else if (handle === 'ne') { ax = orig.x; ay = orig.y + orig.h; }
  else if (handle === 'sw') { ax = orig.x + orig.w; ay = orig.y; }
  else if (handle === 'nw') { ax = orig.x + orig.w; ay = orig.y + orig.h; }

  return groupOrig.map((o) => {
    if (o.type === 'quad' && o.points) {
      const newPoints = o.points.map((pt: any) => {
        const rx = ax + (pt.x - ax) * scaleX;
        const ry = ay + (pt.y - ay) * scaleY;
        return {
          x: clamp(rx, 0, imageW),
          y: clamp(ry, 0, imageH)
        };
      });
      const xs = newPoints.map((p: any) => p.x);
      const ys = newPoints.map((p: any) => p.y);
      const rx = Math.min(...xs), ry = Math.min(...ys);
      return {
        ...o,
        points: newPoints,
        x: rx, y: ry, w: Math.max(...xs) - rx, h: Math.max(...ys) - ry
      };
    } else {
      const nx1 = ax + (o.x - ax) * scaleX;
      const nx2 = ax + (o.x + o.w - ax) * scaleX;
      const ny1 = ay + (o.y - ay) * scaleY;
      const ny2 = ay + (o.y + o.h - ay) * scaleY;

      const rx = clamp(Math.min(nx1, nx2), 0, imageW);
      const ry = clamp(Math.min(ny1, ny2), 0, imageH);
      const rw = clamp(Math.max(nx1, nx2), 0, imageW) - rx;
      const rh = clamp(Math.max(ny1, ny2), 0, imageH) - ry;

      return { ...o, x: rx, y: ry, w: rw, h: rh };
    }
  });
}

describe('Multi-Bbox Resize Mathematical Logic', () => {
  const imageW = 800;
  const imageH = 600;

  it('correctly resizes a group of bboxes when dragging se handle (bottom-right)', () => {
    const origBox1 = { id: '1', type: 'bbox', x: 100, y: 100, w: 100, h: 100 };
    const origBox2 = { id: '2', type: 'bbox', x: 300, y: 200, w: 50, h: 50 };
    
    // Resize Box1 to w=200, h=200 by dragging se handle to (300, 300)
    // scaleX = 2, scaleY = 2
    // anchor point for 'se' is top-left of Box1: (100, 100)
    const result = resizeBoxes([origBox1, origBox2], origBox1, 'se', 300, 300, imageW, imageH);

    expect(result[0]).toEqual({ id: '1', type: 'bbox', x: 100, y: 100, w: 200, h: 200 });
    
    // Box2:
    // x = 100 + (300 - 100) * 2 = 500
    // y = 100 + (200 - 100) * 2 = 300
    // w = 50 * 2 = 100
    // h = 50 * 2 = 100
    expect(result[1]).toEqual({ id: '2', type: 'bbox', x: 500, y: 300, w: 100, h: 100 });
  });

  it('correctly resizes a group of bboxes when dragging nw handle (top-left)', () => {
    const origBox1 = { id: '1', type: 'bbox', x: 200, y: 200, w: 100, h: 100 };
    const origBox2 = { id: '2', type: 'bbox', x: 100, y: 100, w: 50, h: 50 };

    // Resize Box1 by dragging nw handle from (200, 200) to (150, 150)
    // Box1 new dimensions: x = 150, y = 150, w = 150, h = 150
    // scaleX = 150 / 100 = 1.5, scaleY = 1.5
    // anchor point for 'nw' is bottom-right of Box1: (300, 300)
    const result = resizeBoxes([origBox1, origBox2], origBox1, 'nw', 150, 150, imageW, imageH);

    expect(result[0]).toEqual({ id: '1', type: 'bbox', x: 150, y: 150, w: 150, h: 150 });

    // Box2 original: x=100, y=100, w=50, h=50. Right = 150, Bottom = 150
    // Relative to anchor (300, 300):
    // nx1 = 300 + (100 - 300) * 1.5 = 300 - 300 = 0
    // nx2 = 300 + (150 - 300) * 1.5 = 300 - 225 = 75
    // So new Box2: x = 0, w = 75
    expect(result[1]).toEqual({ id: '2', type: 'bbox', x: 0, y: 0, w: 75, h: 75 });
  });

  it('clamps coordinates to image boundaries on resize', () => {
    const origBox1 = { id: '1', type: 'bbox', x: 100, y: 100, w: 100, h: 100 };
    const origBox2 = { id: '2', type: 'bbox', x: 300, y: 200, w: 50, h: 50 };

    // Scale to very large (scale = 10)
    // This should push Box2 coordinates outside (800, 600)
    const result = resizeBoxes([origBox1, origBox2], origBox1, 'se', 1100, 1100, imageW, imageH);

    expect(result[0].x).toBe(100);
    expect(result[0].y).toBe(100);
    expect(result[0].w).toBe(800 - 100); // clamped at image edge
    expect(result[1].x).toBeLessThanOrEqual(800);
    expect(result[1].y).toBeLessThanOrEqual(600);
    expect(result[1].x + result[1].w).toBeLessThanOrEqual(800);
    expect(result[1].y + result[1].h).toBeLessThanOrEqual(600);
  });
});

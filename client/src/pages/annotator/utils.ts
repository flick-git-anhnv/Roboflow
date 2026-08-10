import type { Annotation, Point, SuggestedBox } from '../../types';
import type { Box } from './types';

export const HANDLE_SIZE = 8;

export function drawLabel(ctx: CanvasRenderingContext2D, label: string, color: string, x: number, y: number) {
  ctx.font = '12px sans-serif';
  const textW = ctx.measureText(label).width + 8;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 16, textW, 16);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x + 4, y - 4);
}

export function boundingRect(points: Point[]) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function pointInPolygon(x: number, y: number, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y, xj = points[j].x, yj = points[j].y;
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function cloneBox(b: Box): Box {
  return {
    ...b,
    points: b.points ? (b.points.map((p) => ({ ...p })) as [Point, Point, Point, Point]) : undefined,
    text_content: b.text_content
  };
}

export function annotationToBox(a: Annotation): Box {
  if (a.type === 'quad' && a.points && a.points.length === 4) {
    return { id: a.id, class_id: a.class_id, type: 'quad', x: a.x, y: a.y, w: a.w, h: a.h, points: a.points };
  }
  if (a.type === 'classify') {
    return { id: a.id, class_id: a.class_id, type: 'classify', x: a.x, y: a.y, w: a.w, h: a.h };
  }
  if (a.type === 'text_rec') {
    return { id: a.id, class_id: a.class_id, type: 'text_rec', x: a.x, y: a.y, w: a.w, h: a.h, text_content: a.text_content || '' };
  }
  return { id: a.id, class_id: a.class_id, type: 'bbox', x: a.x, y: a.y, w: a.w, h: a.h };
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function suggestionToBox(s: SuggestedBox): Box {
  const id = `suggest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (s.type === 'quad' && s.points && s.points.length === 4) {
    return { id, class_id: s.class_id, type: 'quad', x: s.x, y: s.y, w: s.w, h: s.h, points: s.points as [Point, Point, Point, Point] };
  }
  return { id, class_id: s.class_id, type: 'bbox', x: s.x, y: s.y, w: s.w, h: s.h };
}

export function fuzzyMatch(query: string, name: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  if (n.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

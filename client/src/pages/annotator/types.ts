import type { Point } from '../../types';

export type { Point };

export interface Box {
  id: string;
  class_id: string;
  type: 'bbox' | 'quad' | 'classify' | 'text_rec';
  x: number; y: number; w: number; h: number; // bounding rect (image pixel coordinates), always kept in sync
  points?: [Point, Point, Point, Point]; // present only for type === 'quad'
  text_content?: string;
}

export type Tool = 'bbox' | 'quad' | 'classify' | 'text_rec';
export type DragMode = 'none' | 'draw' | 'move' | 'resize' | 'select';
export type Handle = 'nw' | 'ne' | 'sw' | 'se' | number | null;

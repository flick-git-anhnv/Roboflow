import type { Point } from '../../types';

export type { Point };

export interface Box {
  id: string;
  class_id: string;
  type: 'bbox' | 'quad' | 'classify' | 'text_rec' | 'sam_smart_polygon';
  x: number; y: number; w: number; h: number; // bounding rect (image pixel coordinates), always kept in sync
  points?: Point[]; // present for polygon or quad
  text_content?: string;
  source?: 'manual' | 'sam_smart_polygon' | 'auto_prompt';
}

export type Tool = 'bbox' | 'quad' | 'classify' | 'text_rec' | 'sam_smart_polygon';
export type DragMode = 'none' | 'draw' | 'move' | 'resize' | 'select';
export type Handle = 'nw' | 'ne' | 'sw' | 'se' | number | null;


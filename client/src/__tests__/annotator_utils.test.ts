import { describe, it, expect } from 'vitest';
import {
  boundingRect,
  pointInPolygon,
  cloneBox,
  annotationToBox,
  suggestionToBox,
  clamp,
  fuzzyMatch,
  HANDLE_SIZE,
} from '../pages/annotator/utils';
import type { Annotation, Point, SuggestedBox } from '../types';
import type { Box } from '../pages/annotator/types';

describe('Annotator Utils Module', () => {
  it('HANDLE_SIZE constant is defined', () => {
    expect(HANDLE_SIZE).toBe(8);
  });

  it('clamp restricts value within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('boundingRect calculates bounding rectangle of points', () => {
    const points: Point[] = [
      { x: 10, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 80 },
      { x: 10, y: 80 },
    ];
    const rect = boundingRect(points);
    expect(rect).toEqual({ x: 10, y: 20, w: 40, h: 60 });
  });

  it('pointInPolygon checks point inside quadrilateral polygon', () => {
    const quad: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon(50, 50, quad)).toBe(true);
    expect(pointInPolygon(150, 50, quad)).toBe(false);
  });

  it('cloneBox creates a deep clone of a Box object', () => {
    const box: Box = {
      id: 'b1',
      class_id: 'c1',
      type: 'quad',
      x: 0, y: 0, w: 50, h: 50,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 0, y: 50 },
      ],
    };
    const cloned = cloneBox(box);
    expect(cloned).toEqual(box);
    expect(cloned).not.toBe(box);
    if (cloned.points && box.points) {
      expect(cloned.points).not.toBe(box.points);
    }
  });

  it('annotationToBox converts backend Annotation to Box object', () => {
    const annBbox: Annotation = {
      id: 'a1',
      image_id: 'i1',
      class_id: 'c1',
      type: 'bbox',
      x: 10, y: 10, w: 20, h: 20,
      points: [] as any,
    };
    const boxBbox = annotationToBox(annBbox);
    expect(boxBbox.type).toBe('bbox');
    expect(boxBbox.id).toBe('a1');

    const annQuad: Annotation = {
      id: 'a2',
      image_id: 'i1',
      class_id: 'c1',
      type: 'quad',
      x: 10, y: 10, w: 20, h: 20,
      points: [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 30 },
        { x: 10, y: 30 },
      ],
    };
    const boxQuad = annotationToBox(annQuad);
    expect(boxQuad.type).toBe('quad');
    expect(boxQuad.points).toHaveLength(4);
  });

  it('suggestionToBox generates new Box from suggestion payload', () => {
    const suggestion: SuggestedBox = {
      class_id: 'c1',
      type: 'bbox',
      x: 5, y: 5, w: 10, h: 10,
      conf: 0.95,
    };
    const box = suggestionToBox(suggestion);
    expect(box.class_id).toBe('c1');
    expect(box.type).toBe('bbox');
    expect(box.id).toContain('suggest_');
  });

  it('fuzzyMatch accurately matches query strings', () => {
    expect(fuzzyMatch('', 'Cat')).toBe(true);
    expect(fuzzyMatch('cat', 'Cat')).toBe(true);
    expect(fuzzyMatch('ct', 'Cat')).toBe(true);
    expect(fuzzyMatch('dog', 'Cat')).toBe(false);
  });
});

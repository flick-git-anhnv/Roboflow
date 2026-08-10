"""
Batch YOLO inference for KZTEK Labeling Studio's auto-label feature.

Reads a JSON job description from stdin:
  { "model_path": str, "conf": float, "images": [{"id": str, "path": str}, ...] }

Streams one JSON line per processed image to stdout as soon as it's done
(so the Node server can show live progress and start writing annotations
immediately instead of waiting for the whole batch):
  {"image_id": str, "boxes": [...], "classes": [str, ...]}
  {"image_id": str, "error": str, "classes": [str, ...]}

Then a final line: {"done": true}

Each box is either:
  {"class_index": int, "type": "bbox", "x": float, "y": float, "w": float, "h": float}
  {"class_index": int, "type": "quad", "points": [{"x":.., "y":..}, x4]}
Coordinates are in the original image's pixel space.
"""
import json
import sys


def main():
    payload = json.loads(sys.stdin.read())
    model_path = payload['model_path']
    conf = payload.get('conf', 0.25)
    images = payload.get('images', [])

    from ultralytics import YOLO

    model = YOLO(model_path)
    names = model.names
    class_list = [names[i] for i in sorted(names.keys())]

    for img in images:
        try:
            results = model.predict(source=img['path'], conf=conf, verbose=False)
            r = results[0]
            boxes_out = []

            obb = getattr(r, 'obb', None)
            if obb is not None and len(obb) > 0:
                for i in range(len(obb)):
                    cls_idx = int(obb.cls[i].item())
                    pts = obb.xyxyxyxy[i].tolist()
                    boxes_out.append({
                        'class_index': cls_idx,
                        'type': 'quad',
                        'points': [{'x': float(p[0]), 'y': float(p[1])} for p in pts],
                    })
            elif r.boxes is not None:
                for i in range(len(r.boxes)):
                    cls_idx = int(r.boxes.cls[i].item())
                    x1, y1, x2, y2 = [float(v) for v in r.boxes.xyxy[i].tolist()]
                    boxes_out.append({
                        'class_index': cls_idx,
                        'type': 'bbox',
                        'x': x1, 'y': y1, 'w': x2 - x1, 'h': y2 - y1,
                    })

            print(json.dumps({'image_id': img['id'], 'boxes': boxes_out, 'classes': class_list}), flush=True)
        except Exception as e:
            print(json.dumps({'image_id': img['id'], 'error': str(e), 'classes': class_list}), flush=True)

    print(json.dumps({'done': True}), flush=True)


if __name__ == '__main__':
    main()

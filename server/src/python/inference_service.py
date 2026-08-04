"""
KZTEK Labeling Studio — Persistent Inference Service
FastAPI + uvicorn, chạy tại 127.0.0.1:{INFERENCE_PORT} (mặc định 8001)

Endpoints:
  GET  /health   — trạng thái service + danh sách model đang giữ trong RAM
  POST /warmup   — preload model vào LRU cache (giảm latency lần đầu)
  POST /predict  — batch YOLO inference (trả toàn bộ kết quả 1 lần, không stream)

LRU cache: tối đa 3 model trong RAM. Model cũ nhất bị evict khi đầy.
Đặt INFERENCE_PORT để đổi port (mặc định 8001).
Giữ infer.py cũ — không xóa. Rollback: USE_LEGACY_INFER=1 trong Node.
"""
import os
import time
from collections import OrderedDict
from typing import List

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


# ─── LRU Model Cache ──────────────────────────────────────────────────────────

class LRUModelCache:
    """LRU cache giữ YOLO model trong RAM, tối đa max_size model."""

    def __init__(self, max_size: int = 3):
        self._cache: OrderedDict = OrderedDict()
        self._max_size = max_size

    def get(self, key: str):
        if key not in self._cache:
            return None
        self._cache.move_to_end(key)
        return self._cache[key]

    def put(self, key: str, model) -> None:
        if key in self._cache:
            self._cache.move_to_end(key)
        else:
            if len(self._cache) >= self._max_size:
                evicted, _ = self._cache.popitem(last=False)
                print(f"[inference_service] LRU evict: {evicted}", flush=True)
            self._cache[key] = model

    def keys(self) -> list:
        return list(self._cache.keys())


_model_cache = LRUModelCache(max_size=3)
_start_time = time.time()

# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="KZTEK Inference Service",
    description="Persistent YOLO inference service — model giữ trong RAM, không load lại từ disk mỗi request",
    version="1.1.0",
)


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class ImageInput(BaseModel):
    id: str
    path: str


class PredictRequest(BaseModel):
    model_path: str
    conf: float = 0.25
    iou: float = 0.45
    images: List[ImageInput]


class WarmupRequest(BaseModel):
    model_path: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _load_model(model_path: str):
    """Lấy model từ LRU cache hoặc load từ disk và cache lại."""
    model = _model_cache.get(model_path)
    if model is not None:
        return model

    print(f"[inference_service] Loading model: {model_path}", flush=True)
    try:
        from ultralytics import YOLO  # lazy import — không block startup nếu chưa cài
        model = YOLO(model_path)
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="ultralytics chưa được cài. Chạy: pip install ultralytics",
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Không tìm thấy file model: {model_path}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Không thể load model '{model_path}': {exc}",
        )

    _model_cache.put(model_path, model)
    print(f"[inference_service] Model cached: {model_path}", flush=True)
    return model


def _predict_single(model, img_path: str, conf: float, iou: float) -> list:
    """
    Chạy YOLO predict trên 1 ảnh.
    Trả về list box dict (bbox hoặc quad), tương thích với format infer.py cũ.
    """
    results = model.predict(source=img_path, conf=conf, iou=iou, verbose=False)
    r = results[0]
    boxes_out = []

    obb = getattr(r, "obb", None)
    if obb is not None and len(obb) > 0:
        # OBB model → quad (4-điểm)
        for i in range(len(obb)):
            cls_idx = int(obb.cls[i].item())
            pts = obb.xyxyxyxy[i].tolist()
            boxes_out.append({
                "class_index": cls_idx,
                "type": "quad",
                "points": [{"x": float(p[0]), "y": float(p[1])} for p in pts],
            })
    elif r.boxes is not None:
        # Standard bbox model
        for i in range(len(r.boxes)):
            cls_idx = int(r.boxes.cls[i].item())
            x1, y1, x2, y2 = [float(v) for v in r.boxes.xyxy[i].tolist()]
            boxes_out.append({
                "class_index": cls_idx,
                "type": "bbox",
                "x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1,
            })

    return boxes_out


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Trả về trạng thái service và danh sách model đang giữ trong RAM."""
    return {
        "status": "ok",
        "loaded_models": _model_cache.keys(),
        "uptime_s": int(time.time() - _start_time),
    }


@app.post("/warmup")
def warmup(req: WarmupRequest):
    """Preload model vào LRU cache — gọi khi user chọn model trong UI."""
    t0 = time.time()
    _load_model(req.model_path)
    took_ms = int((time.time() - t0) * 1000)
    return {"loaded": True, "model_path": req.model_path, "took_ms": took_ms}


@app.post("/predict")
def predict(req: PredictRequest):
    """
    Batch inference: nhận danh sách ảnh, trả toàn bộ kết quả trong 1 response.
    Node chia job lớn thành nhiều request 32 ảnh và tự track progress qua jobs Map.

    Response shape:
      {
        "classes": ["class_name_0", ...],   # tên class từ model (theo index)
        "results": [
          {
            "image_id": "nanoid",
            "detections": [
              {"class_index": 0, "type": "bbox", "x": ..., "y": ..., "w": ..., "h": ...},
              {"class_index": 1, "type": "quad", "points": [...]}
            ]
          }
        ],
        "errors": [
          {"image_id": "nanoid", "error": "message"}
        ]
      }
    """
    model = _load_model(req.model_path)
    names = model.names
    class_list = [names[i] for i in sorted(names.keys())]

    results_out = []
    errors_out = []

    for img in req.images:
        try:
            detections = _predict_single(model, img.path, req.conf, req.iou)
            results_out.append({
                "image_id": img.id,
                "detections": detections,
            })
        except Exception as exc:
            errors_out.append({"image_id": img.id, "error": str(exc)})

    return {
        "classes": class_list,
        "results": results_out,
        "errors": errors_out,
    }


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("INFERENCE_PORT", 8001))
    print(f"[inference_service] Starting on http://127.0.0.1:{port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

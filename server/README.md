# KZTEK Labeling Studio — Server

## Yêu cầu

- **Node.js 18+** (dùng global `fetch` và `node --watch`)
- **Python 3.9+** với pip
- Python packages cho inference service:
  ```bash
  pip install fastapi uvicorn ultralytics
  ```

## Khởi chạy (development)

```bash
cd server
npm install
npm run dev
```

Node server khởi động tại `http://localhost:4000` và tự động spawn inference service Python tại `http://127.0.0.1:8001`.

## Biến môi trường

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `4000` | Port Node.js/Express server |
| `PYTHON_BIN` | `python` | Đường dẫn Python executable (VD: `python3`, `C:\Python311\python.exe`) |
| `INFERENCE_PORT` | `8001` | Port FastAPI inference service |
| `USE_LEGACY_INFER` | _(không đặt)_ | Đặt `1` để rollback về cơ chế spawn-per-request cũ |

## Chạy inference service

Node server **tự động** spawn `server/src/python/inference_service.py` khi khởi động.
Không cần chạy tay trong điều kiện bình thường.

### Rollback về infer.py cũ

Nếu FastAPI service gặp sự cố, rollback về cơ chế spawn-per-request (infer.py):

```bash
# Windows
set USE_LEGACY_INFER=1 && npm start

# Linux/macOS
USE_LEGACY_INFER=1 npm start
```

### Chạy inference service độc lập (debug/test)

```bash
cd server/src/python
python inference_service.py

# Đổi port:
INFERENCE_PORT=8002 python inference_service.py
```

Health check:
```bash
curl http://127.0.0.1:8001/health
```

Kết quả mong đợi:
```json
{"status":"ok","loaded_models":[],"uptime_s":3}
```

### Warm up model trước khi auto-label

```bash
curl -X POST http://127.0.0.1:8001/warmup \
  -H "Content-Type: application/json" \
  -d '{"model_path": "/absolute/path/to/model.pt"}'
```

## Cấu trúc Python inference

```
server/src/python/
├── inference_service.py   ← FastAPI service (DÙNG MẶC ĐỊNH)
│                            LRU cache 3 model trong RAM
│                            Endpoints: GET /health, POST /warmup, POST /predict
└── infer.py               ← Spawn-per-request cũ (GIỮ LẠI để rollback)
                             Kích hoạt bằng USE_LEGACY_INFER=1
```

#!/usr/bin/env bash
# KZTEK Labeling Studio - Khoi dong ung dung (Ubuntu ARM64)
set -e

cd "$(dirname "$0")"

export PORT="${PORT:-4000}"

# Client duoc build tinh va phuc vu chung origin voi server (khong phai dev server 5173),
# nen phai cho phep CORS chinh origin nay - neu khong server se tu chan API cua chinh no
# (trieu chung: trang load duoc nhung trang trang / khong dang nhap duoc, log server bao
# "CORS blocked: http://localhost:<port>"). Van cho phep override qua bien moi truong ngoai.
export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:$PORT}"

echo "=============================================="
echo "  KZTEK Labeling Studio - Khoi dong ung dung"
echo "=============================================="

ARCH="$(uname -m)"
if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
  echo "Canh bao: kien truc phat hien la '$ARCH', script nay danh cho ARM64 (aarch64)."
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Loi: chua cai Node.js. Cai dat truoc khi chay script nay."
  echo "Vi du (NodeSource): curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi

if [ ! -d "server/node_modules" ]; then
  echo "[1/4] Cai dat dependencies cho server..."
  npm install --prefix server
fi

if [ ! -d "client/node_modules" ]; then
  echo "[2/4] Cai dat dependencies cho client..."
  npm install --prefix client
fi

echo "[3/4] Kiem tra cong $PORT co bi chiem khong..."
OLD_PID="$(command -v lsof >/dev/null 2>&1 && lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$OLD_PID" ]; then
  echo "Phat hien tien trinh cu (PID $OLD_PID) dang giu cong $PORT - dang dong..."
  kill -9 $OLD_PID 2>/dev/null || true
  sleep 1
fi

echo "[4/4] Build giao dien va khoi chay server..."
if [ -f "server/data/server.log" ]; then
  echo "Cleaning old server logs..."
  rm "server/data/server.log"
fi
npm run build --prefix client

if [ ! -d "client/dist" ]; then
  echo "Loi: build client that bai. Kiem tra log ben tren."
  exit 1
fi

echo ""
echo "Server sap chay tai http://localhost:$PORT"
echo "Nhan Ctrl+C de dung server."
echo ""

npm run start --prefix server

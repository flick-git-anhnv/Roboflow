#!/usr/bin/env bash
# KZTEK Labeling Studio - Khoi dong ung dung (Ubuntu ARM64)
set -e

cd "$(dirname "$0")"

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
  echo "[1/3] Cai dat dependencies cho server..."
  npm install --prefix server
fi

if [ ! -d "client/node_modules" ]; then
  echo "[2/3] Cai dat dependencies cho client..."
  npm install --prefix client
fi

echo "[3/3] Build giao dien va khoi chay server..."
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
echo "Server dang chay tai http://localhost:4000"
echo "Nhan Ctrl+C de dung server."
echo ""

npm run start --prefix server

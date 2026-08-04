#!/usr/bin/env bash
# Cai dat KZTEK Labeling Studio thanh systemd service, tu khoi dong khi mo may
# Chay: sudo ./deploy/install_service.sh
set -e

if [ "$EUID" -ne 0 ]; then
  echo "Loi: hay chay script nay bang sudo."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
SERVICE_NAME="kztek-labeling-studio"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Node/npm co the duoc cai qua nvm (chi co trong PATH cua user, khong co o root/sudo).
# Nen phai do duong dan npm/node thuc te cua RUN_USER thay vi goi truc tiep "npm".
USER_HOME=$(getent passwd "$RUN_USER" | cut -d: -f6)
RESOLVE_CMD='
  for f in "$HOME/.nvm/nvm.sh" /usr/local/opt/nvm/nvm.sh; do
    [ -s "$f" ] && \. "$f" >/dev/null 2>&1
  done
  command -v npm
'
NPM_BIN=$(sudo -u "$RUN_USER" -H env HOME="$USER_HOME" bash -c "$RESOLVE_CMD" 2>/dev/null | tail -n1)

if [ -z "$NPM_BIN" ]; then
  echo "Loi: khong tim thay npm cho user '$RUN_USER'."
  echo "Kiem tra bang: sudo -u $RUN_USER bash -lc 'command -v npm'"
  echo "Neu dung nvm, dam bao ~/.nvm/nvm.sh ton tai va da chay 'nvm install --lts'."
  exit 1
fi
NODE_DIR="$(dirname "$NPM_BIN")"
NODE_BIN="$NODE_DIR/node"
echo "Dung npm: $NPM_BIN"
echo "Dung node: $NODE_BIN"

# npm co shebang "#!/usr/bin/env node" nen phai dua NODE_DIR len dau PATH,
# neu khong "env node" se resolve nham sang node he thong (vd nodejs 8.x cua apt).
RUN_NPM() {
  sudo -u "$RUN_USER" -H env HOME="$USER_HOME" PATH="$NODE_DIR:$PATH" "$NPM_BIN" "$@"
}

echo "== Cai dat dependencies cho server =="
# Xoa node_modules cu (neu duoc copy san tu may khac, vd Windows) de ep rebuild
# native module (better-sqlite3, sharp) dung cho kien truc/OS cua thiet bi nay.
rm -rf "$APP_DIR/server/node_modules"
RUN_NPM install --prefix "$APP_DIR/server"

if [ -d "$APP_DIR/client/dist" ]; then
  echo "== Da co client/dist (build san) - bo qua build client tren thiet bi =="
else
  echo "Canh bao: khong tim thay client/dist."
  echo "Vite yeu cau Node >= 18, thiet bi nay chi chay duoc Node 16 (glibc cu)."
  echo "Hay build client tren may khac (Node >= 18) roi copy thu muc client/dist sang thiet bi nay,"
  echo "hoac chay: npm install --prefix client && npm run build --prefix client tren may do."
  exit 1
fi

echo "== Tao systemd service tai $SERVICE_FILE =="
sed -e "s#__APP_DIR__#${APP_DIR}#g" \
    -e "s/%i/${RUN_USER}/g" \
    -e "s#/usr/bin/node#${NODE_BIN}#g" \
  "$SCRIPT_DIR/kztek-labeling-studio.service" > "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo ""
echo "Da cai dat xong. Service se tu khoi dong khi mo may."
echo "Kiem tra trang thai: sudo systemctl status $SERVICE_NAME"
echo "Xem log:             sudo journalctl -u $SERVICE_NAME -f"
echo "Truy cap:             http://localhost:4000"

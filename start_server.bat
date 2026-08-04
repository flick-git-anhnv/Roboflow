@echo off
setlocal

echo ==============================================
echo   KZTEK Labeling Studio - Khoi dong ung dung
echo ==============================================

cd /d "%~dp0"

if not exist "server\node_modules" (
  echo [1/3] Cai dat dependencies cho server...
  call npm install --prefix server
)

if not exist "client\node_modules" (
  echo [2/3] Cai dat dependencies cho client...
  call npm install --prefix client
)

echo [3/3] Build giao dien va khoi chay server...
call npm run build --prefix client
if not exist "client\dist" (
  echo Loi: build client that bai. Kiem tra log ben tren.
  pause
  exit /b 1
)

echo.
echo Server dang chay tai http://localhost:4000
echo Nhan Ctrl+C de dung server.
echo.

call npm run start --prefix server

pause

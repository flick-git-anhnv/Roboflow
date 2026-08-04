@echo off
setlocal

echo ==============================================
echo   KZTEK Labeling Studio - Che do phat trien (dev)
echo ==============================================

cd /d "%~dp0"

if not exist "server\node_modules" call npm install --prefix server
if not exist "client\node_modules" call npm install --prefix client

echo Dang mo backend (http://localhost:4000) va frontend (http://localhost:5173)...
start "KZTEK Labeling Studio - Server" cmd /k "cd /d %~dp0server && npm run dev"
start "KZTEK Labeling Studio - Client" cmd /k "cd /d %~dp0client && npm run dev"

echo Da mo 2 cua so terminal. Truy cap http://localhost:5173 de su dung.
pause

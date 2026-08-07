@echo off
setlocal enabledelayedexpansion

title KZTEK Labeling Studio - Server
set "PORT=4000"

REM Client duoc build tinh va phuc vu chung origin voi server (khong phai dev server 5173),
REM nen phai cho phep CORS chinh origin nay - neu khong server se tu chan API cua chinh no.
set "CORS_ORIGIN=http://localhost:%PORT%"

echo ==============================================
echo   KZTEK Labeling Studio - Khoi dong ung dung
echo ==============================================

cd /d "%~dp0"

if not exist "server\node_modules" (
  echo [1/4] Cai dat dependencies cho server...
  call npm install --prefix server
)

if not exist "client\node_modules" (
  echo [2/4] Cai dat dependencies cho client...
  call npm install --prefix client
)

echo [3/4] Kiem tra cong %PORT% co bi chiem khong...
set "OLD_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do set "OLD_PID=%%p"
if defined OLD_PID (
  echo Phat hien tien trinh cu ^(PID !OLD_PID!^) dang giu cong %PORT% - dang dong...
  taskkill /PID !OLD_PID! /F >nul 2>&1
  ping 127.0.0.1 -n 2 >nul
)

echo [4/4] Build giao dien va khoi chay server...
if exist "server\data\server.log" (
  echo Cleaning old server logs...
  del "server\data\server.log"
)
call npm run build --prefix client
if not exist "client\dist" (
  echo Loi: build client that bai. Kiem tra log ben tren.
  pause
  exit /b 1
)

echo.
echo Server sap chay tai http://localhost:%PORT%
echo Nhan Ctrl+C de dung server.
echo.

REM Tu dong mo trinh duyet sau khi server kip khoi dong
start "" /min cmd /c "ping 127.0.0.1 -n 4 >nul && start http://localhost:%PORT%"

call npm run start --prefix server

pause

@echo off
REM ==========================================================================
REM  Pharos dev launcher.
REM  Starts the three pieces Pharos needs in development:
REM    1) Postgres database  (Docker container "pharos-db")
REM    2) Backend API        (Node/Fastify, http://localhost:3000)
REM    3) Desktop app        (Tauri + Vite)
REM  Double-click this file, or run  dev.bat  from a terminal.
REM ==========================================================================
cd /d "%~dp0"

echo [Pharos] Ensuring Postgres (pharos-db) is running...
docker compose up -d db
if errorlevel 1 (
  echo.
  echo [Pharos] ERROR: could not start Postgres.
  echo          Make sure Docker Desktop is running, then try again.
  echo.
  pause
  exit /b 1
)

echo [Pharos] Opening backend API window (http://localhost:3000)...
start "Pharos API" /d "%~dp0server" cmd /k "npm start"

echo [Pharos] Opening desktop app window (Tauri + Vite)...
start "Pharos App" cmd /k "npm run tauri dev"

echo.
echo [Pharos] Started. Two windows are now open:
echo    - "Pharos API"  backend on http://localhost:3000
echo    - "Pharos App"  Vite (1420) + the native window
echo.
echo  To stop: close each window (or press Ctrl+C inside it).
echo  The database keeps running in Docker; run  stop.bat  to stop it too.
echo.

@echo off
REM Stops the Pharos Postgres container. Close the "Pharos API" and
REM "Pharos App" windows manually (Ctrl+C) to stop those.
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (
  echo [Pharos] Docker not found: Postgres runs as a native Windows service
  echo          and is left running. Stop it from services.msc if needed.
) else (
  echo [Pharos] Stopping Postgres container pharos-db...
  docker compose stop db
)
echo.
echo [Pharos] Done. If the "Pharos API"/"Pharos App" windows are still open,
echo          close them to stop the API and the desktop app.
echo.
pause

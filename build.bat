@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  MusPlay 1.2.4 - Windows build
echo ==========================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js LTS and try again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js with npm included.
  pause
  exit /b 1
)

if not exist package-lock.json (
  echo [ERROR] package-lock.json is missing.
  pause
  exit /b 1
)

echo [1/3] Installing dependencies...
npm ci
if errorlevel 1 goto :failed

echo [2/3] Building the application...
npm run build
if errorlevel 1 goto :failed

echo [3/3] Packaging MusPlay for Windows...
npx electron-builder --win --x64
if errorlevel 1 goto :failed

echo.
echo Build completed. Check the release folder.
pause
exit /b 0

:failed
echo.
echo [ERROR] Build failed. Review the messages above.
pause
exit /b 1

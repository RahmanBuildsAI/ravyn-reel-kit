@echo off
title ravyn
rem Double-click to open ravyn, the reel editor, in your browser.
rem Keep this window open while you edit. Close it (or press Ctrl+C) to stop ravyn.

cd /d "%~dp0studio"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed yet, so ravyn cannot start.
  echo   Install it with docs\SETUP.md, Step 1, then double-click this file again.
  echo.
  pause
  exit /b 1
)

netstat -ano | findstr ":3140 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo.
  echo   ravyn is already running. Opening it in your browser.
  echo.
  start "" http://localhost:3140
  ping -n 4 127.0.0.1 >nul
  exit /b 0
)

echo.
echo   Starting ravyn. Your browser opens in a moment.
echo   Keep this window open while you edit. Close it to stop ravyn.
echo.
start "" /min cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:3140"
node ravyn\server.mjs

echo.
echo   ravyn stopped.
pause

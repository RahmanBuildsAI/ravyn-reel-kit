@echo off
title ravyn: render the example reel
rem Double-click to build and render the 26-second example reel.
rem It is the setup test: if the video plays, everything is installed right.

cd /d "%~dp0studio"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed yet. Install it with docs\SETUP.md, Step 1.
  echo.
  pause
  exit /b 1
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo.
  echo   ffmpeg is not installed yet. Install it with docs\SETUP.md, then try again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Building the example reel...
node assets\example\build.mjs
if errorlevel 1 goto failed

echo.
echo   Rendering it. This takes a minute or two.
node ravyn\cli.mjs render example-kit-tour --workers 2
if errorlevel 1 goto failed

echo.
echo   Done. Opening the renders folder: play example-kit-tour-v1.mp4
echo   If it matches docs\example-reel.mp4, everything works.
start "" "%~dp0studio\renders"
echo.
pause
exit /b 0

:failed
echo.
echo   Something went wrong. Copy the red text above and ask Claude, or see docs\SUPPORT.md.
echo.
pause
exit /b 1

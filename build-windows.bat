@echo off
REM YouTube Live Loop Tool — one-click Windows build (run on your Windows PC).
REM Needs Node.js LTS installed. Builds the NSIS installer into app\dist.
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js not found. Install Node.js LTS from https://nodejs.org then run again. & pause & exit /b 1)
call npm install
if errorlevel 1 (echo npm install failed. & pause & exit /b 1)
call npm run dist:win
if errorlevel 1 (echo Build failed. & pause & exit /b 1)
echo.
echo Done. Installer is in dist\YouTubeLiveLoopTool-Setup.exe
pause

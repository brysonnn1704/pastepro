@echo off
title PastePro / Clipper Launcher
cd /d "%~dp0"

echo ========================================================
echo   PastePro - Private iPhone to PC Clipboard Bridge
echo ========================================================
echo.
echo Starting local relay server on port 3001...
start "PastePro Server" cmd /c "cd apps\server && pnpm dev"

timeout /t 3 >nul

echo Starting secure Cloudflare tunnel...
cloudflared.exe tunnel --url http://localhost:3001

pause

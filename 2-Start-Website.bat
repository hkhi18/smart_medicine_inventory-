@echo off
REM Starts the Smart Medicine Inventory website on http://localhost:3001
cd /d "%~dp0"
set "PATH=C:\Users\HP\Downloads\nodejs\node-v24.22.1-win-x64;%USERPROFILE%\nodejs;C:\Program Files\nodejs;%PATH%"
if not exist "pgdata" (
  echo Database not found - building it first...
  node scripts\seed.mjs
)
set PORT=3001
set HOSTNAME=localhost
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3001"
echo  Website running at http://localhost:3001  (keep this window open, close it to stop)
node server.js
pause

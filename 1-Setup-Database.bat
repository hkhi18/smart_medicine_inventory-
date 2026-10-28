@echo off
REM Builds the PostgreSQL database (~1M rows) and trains the 9 forecast models. Run once.
cd /d "%~dp0"
set "PATH=C:\Users\HP\Downloads\nodejs\node-v24.22.1-win-x64;%USERPROFILE%\nodejs;C:\Program Files\nodejs;%PATH%"
echo.
echo  Building the database and training forecast models (3-5 minutes)...
echo  Close the website window first if it is running.
echo.
node scripts\seed.mjs
echo.
echo  Finished. Now double-click 2-Start-Website.bat
pause

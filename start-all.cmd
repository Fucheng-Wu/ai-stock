@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\start-all.ps1" %*
if errorlevel 1 (
    echo.
    echo [ERROR] Startup failed. See the message above.
    pause
)

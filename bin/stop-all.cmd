@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-all.ps1" %*
set "STOP_EXIT_CODE=%ERRORLEVEL%"
echo.
pause
exit /b %STOP_EXIT_CODE%

@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."
set "GATEWAY_ROOT=%PROJECT_ROOT%\agent-gateway"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo 未找到 pnpm。请安装 Node.js 22.19+，并通过 corepack 启用 pnpm 10。
  exit /b 1
)

if not exist "%GATEWAY_ROOT%\node_modules" (
  echo 尚未安装 Agent Gateway 依赖。
  echo 请先在项目根目录运行：powershell -ExecutionPolicy Bypass -File .\bin\start-agent-gateway.ps1 -Install
  exit /b 1
)

if not defined PI_WORKSPACE_DIR set "PI_WORKSPACE_DIR=%PROJECT_ROOT%"
if not defined HOST set "HOST=127.0.0.1"
if not defined PORT set "PORT=3000"

cd /d "%GATEWAY_ROOT%"
echo Starting Agent Gateway from %GATEWAY_ROOT%
echo Agent workspace: %PI_WORKSPACE_DIR%
call pnpm start
exit /b %errorlevel%


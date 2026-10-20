$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $projectRoot 'ruoyi-ui'

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found. Install Node.js 22.19+.'
}

if (-not (Test-Path -LiteralPath (Join-Path $frontendRoot 'node_modules'))) {
    throw 'Frontend dependencies are missing. Run bin\start-all.ps1 -Prepare first.'
}

Push-Location $frontendRoot
try {
    Write-Host 'Starting Vue frontend: http://localhost'
    npm run dev
    exit $LASTEXITCODE
} finally {
    Pop-Location
}

param(
    [switch]$Install,
    [ValidateRange(1, 65535)]
    [int]$Port
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$gatewayRoot = Join-Path $projectRoot 'agent-gateway'

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw 'pnpm was not found. Install Node.js 22.19+ and enable pnpm 10 through corepack.'
}

Push-Location $gatewayRoot
try {
    if ($Install) {
        pnpm install
        if ($LASTEXITCODE -ne 0) { throw 'Failed to install Agent Gateway dependencies.' }
    } elseif (-not (Test-Path (Join-Path $gatewayRoot 'node_modules'))) {
        throw 'Agent Gateway dependencies are missing. Run: .\bin\start-agent-gateway.ps1 -Install'
    }

    if ([string]::IsNullOrWhiteSpace($env:PI_WORKSPACE_DIR)) {
        $env:PI_WORKSPACE_DIR = $projectRoot
    }
    if ([string]::IsNullOrWhiteSpace($env:HOST)) { $env:HOST = '127.0.0.1' }
    if ($PSBoundParameters.ContainsKey('Port')) { $env:PORT = "$Port" }
    elseif ([string]::IsNullOrWhiteSpace($env:PORT)) { $env:PORT = '3000' }

    Write-Host "Starting Agent Gateway from $gatewayRoot"
    Write-Host "Agent workspace: $env:PI_WORKSPACE_DIR"
    pnpm start
    exit $LASTEXITCODE
} finally {
    Pop-Location
}


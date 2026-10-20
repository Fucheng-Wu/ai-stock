param(
    [switch]$Prepare
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $projectRoot 'ruoyi-ui'
$gatewayRoot = Join-Path $projectRoot 'agent-gateway'
$gatewayEnv = Join-Path $gatewayRoot '.env'
$ruoyiJar = Join-Path $projectRoot 'ruoyi-admin\target\ruoyi-admin.jar'

function Assert-Command {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$InstallHint
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found. $InstallHint"
    }
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

function Start-ServiceTerminal {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath
    )

    $quotedScriptPath = '"' + $ScriptPath + '"'
    Start-Process `
        -FilePath 'powershell.exe' `
        -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $quotedScriptPath) `
        -WorkingDirectory $projectRoot `
        -PassThru
}

Assert-Command -Name 'java' -InstallHint 'Install JDK 17+ and add it to PATH.'
Assert-Command -Name 'npm' -InstallHint 'Install Node.js 22.19+.'
Assert-Command -Name 'pnpm' -InstallHint 'Enable pnpm 10 through corepack.'

if (-not (Test-Path -LiteralPath $gatewayEnv)) {
    throw 'agent-gateway\.env is missing. Copy .env.example to .env and configure MySQL first.'
}

$needsGatewayInstall = $Prepare -or -not (Test-Path -LiteralPath (Join-Path $gatewayRoot 'node_modules'))
if ($needsGatewayInstall) {
    Write-Host 'Installing Agent Gateway dependencies...'
    Push-Location $gatewayRoot
    try {
        Invoke-CheckedCommand -Command { pnpm install } -FailureMessage 'Failed to install Agent Gateway dependencies.'
    } finally {
        Pop-Location
    }
}

$needsFrontendInstall = $Prepare -or -not (Test-Path -LiteralPath (Join-Path $frontendRoot 'node_modules'))
if ($needsFrontendInstall) {
    Write-Host 'Installing Vue frontend dependencies...'
    Push-Location $frontendRoot
    try {
        Invoke-CheckedCommand -Command { npm install } -FailureMessage 'Failed to install Vue frontend dependencies.'
    } finally {
        Pop-Location
    }
}

$needsBackendBuild = $Prepare -or -not (Test-Path -LiteralPath $ruoyiJar)
if ($needsBackendBuild) {
    Assert-Command -Name 'mvn' -InstallHint 'Install Maven 3.9+ and add it to PATH.'
    Write-Host 'Building the RuoYi backend (tests skipped)...'
    Push-Location $projectRoot
    try {
        Invoke-CheckedCommand -Command { mvn clean package -DskipTests } -FailureMessage 'Failed to build the RuoYi backend.'
    } finally {
        Pop-Location
    }
}

Write-Host 'Opening three service terminals...'
$ruoyiProcess = Start-ServiceTerminal -ScriptPath (Join-Path $PSScriptRoot 'start-ruoyi.ps1')
$gatewayProcess = Start-ServiceTerminal -ScriptPath (Join-Path $PSScriptRoot 'start-agent-gateway.ps1')
$frontendProcess = Start-ServiceTerminal -ScriptPath (Join-Path $PSScriptRoot 'start-frontend.ps1')

Write-Host ''
Write-Host 'Services launched:'
Write-Host "  RuoYi backend PID:    $($ruoyiProcess.Id)  http://localhost:8080"
Write-Host "  Agent Gateway PID:    $($gatewayProcess.Id)  http://127.0.0.1:3000"
Write-Host "  Vue frontend PID:     $($frontendProcess.Id)  http://localhost"
Write-Host 'MySQL and Redis must already be running.'

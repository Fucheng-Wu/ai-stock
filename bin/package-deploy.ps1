param(
    [string]$Version = '0.0.8',
    [string]$OutputParent
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputParent)) {
    $OutputParent = Split-Path -Parent $projectRoot
}

$packageName = "ai-stock-deploy-v$Version"
$packageRoot = Join-Path $OutputParent $packageName
$archivePath = "$packageRoot.zip"
$backendJar = Join-Path $projectRoot 'ruoyi-admin\target\ruoyi-admin.jar'
$frontendDist = Join-Path $projectRoot 'ruoyi-ui\dist'
$gatewayRoot = Join-Path $projectRoot 'agent-gateway'
$deployTemplates = Join-Path $projectRoot 'deploy'

if ((Test-Path -LiteralPath $packageRoot) -or (Test-Path -LiteralPath $archivePath)) {
    throw "Deployment output already exists: $packageRoot or $archivePath. Choose another version or remove the old output explicitly."
}

foreach ($commandName in @('mvn', 'npm')) {
    if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
        throw "$commandName was not found in PATH."
    }
}

Write-Host 'Building RuoYi backend...'
Push-Location $projectRoot
try {
    mvn clean package -Dmaven.test.skip=true
    if ($LASTEXITCODE -ne 0) { throw 'RuoYi backend build failed.' }
} finally {
    Pop-Location
}

Write-Host 'Building Vue frontend...'
Push-Location (Join-Path $projectRoot 'ruoyi-ui')
try {
    if (Test-Path -LiteralPath (Join-Path $projectRoot 'ruoyi-ui\package-lock.json')) {
        npm ci
    } else {
        npm install
    }
    if ($LASTEXITCODE -ne 0) { throw 'Vue dependency installation failed.' }
    npm run build:prod
    if ($LASTEXITCODE -ne 0) { throw 'Vue production build failed.' }
} finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $backendJar)) { throw "Backend artifact is missing: $backendJar" }
if (-not (Test-Path -LiteralPath $frontendDist)) { throw "Frontend artifact is missing: $frontendDist" }
if (-not (Test-Path -LiteralPath (Join-Path $gatewayRoot 'pnpm-lock.yaml'))) {
    throw 'Agent Gateway pnpm-lock.yaml is missing.'
}

Write-Host "Assembling $packageRoot ..."
New-Item -ItemType Directory -Path $packageRoot | Out-Null
foreach ($directory in @('config', 'nginx', 'sql', 'systemd', 'agent-gateway', 'agent-gateway\backend')) {
    New-Item -ItemType Directory -Path (Join-Path $packageRoot $directory) | Out-Null
}

Copy-Item -LiteralPath $backendJar -Destination (Join-Path $packageRoot 'ruoyi-admin.jar')
Copy-Item -LiteralPath $frontendDist -Destination (Join-Path $packageRoot 'dist') -Recurse

foreach ($file in @('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $gatewayRoot $file) -Destination (Join-Path $packageRoot 'agent-gateway')
}
Copy-Item -LiteralPath (Join-Path $gatewayRoot 'shared') -Destination (Join-Path $packageRoot 'agent-gateway\shared') -Recurse
foreach ($file in @('package.json', 'tsconfig.json')) {
    Copy-Item -LiteralPath (Join-Path $gatewayRoot "backend\$file") -Destination (Join-Path $packageRoot 'agent-gateway\backend')
}
foreach ($directory in @('src', 'skills', 'subagents')) {
    Copy-Item -LiteralPath (Join-Path $gatewayRoot "backend\$directory") -Destination (Join-Path $packageRoot "agent-gateway\backend\$directory") -Recurse
}

Copy-Item -LiteralPath (Join-Path $deployTemplates 'config\application.yml') -Destination (Join-Path $packageRoot 'config\application.yml')
Copy-Item -LiteralPath (Join-Path $deployTemplates 'config\application-druid.yml') -Destination (Join-Path $packageRoot 'config\application-druid.yml')
Copy-Item -LiteralPath (Join-Path $deployTemplates 'config\ai-stock.env.example') -Destination (Join-Path $packageRoot 'config\ai-stock.env.example')
Copy-Item -LiteralPath (Join-Path $deployTemplates 'config\agent-gateway.env.example') -Destination (Join-Path $packageRoot 'config\agent-gateway.env.example')
Copy-Item -LiteralPath (Join-Path $deployTemplates 'nginx\ai-stock.conf') -Destination (Join-Path $packageRoot 'nginx\ai-stock.conf')
Copy-Item -LiteralPath (Join-Path $deployTemplates 'systemd\ai-stock.service') -Destination (Join-Path $packageRoot 'systemd\ai-stock.service')
Copy-Item -LiteralPath (Join-Path $deployTemplates 'systemd\ai-stock-agent.service') -Destination (Join-Path $packageRoot 'systemd\ai-stock-agent.service')
Copy-Item -LiteralPath (Join-Path $deployTemplates 'README.md') -Destination (Join-Path $packageRoot 'DEPLOY.md')

Get-ChildItem -LiteralPath (Join-Path $projectRoot 'sql') -Filter '*.sql' -File |
    Copy-Item -Destination (Join-Path $packageRoot 'sql')

Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $archivePath
Write-Host "Deployment package created: $archivePath"

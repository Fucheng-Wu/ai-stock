param(
    [ValidatePattern('^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9]+)*$')]
    [string]$Version = '0.0.8',
    [string]$OutputParent,
    [switch]$SkipBuild,
    [switch]$IncludeStockScreen,
    [switch]$IncludeStockHistory
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

$stockScreenRoot = Join-Path $projectRoot 'data\stock-history\screens'
$stockScreenMetadata = $null
if ($IncludeStockHistory) {
    $IncludeStockScreen = $true
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python is required for a consistent SQLite backup.' }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'data\stock-history\history.sqlite3'))) { throw 'Historical SQLite database is missing.' }
}
if ($IncludeStockScreen) {
    $stockScreenMetadata = Get-Content -LiteralPath (Join-Path $stockScreenRoot 'latest.json') -Raw | ConvertFrom-Json
    if ($stockScreenMetadata.state -ne 'complete' -or $stockScreenMetadata.snapshotId -notmatch '^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_[a-f0-9]{10}_(all|no-st)$') {
        throw 'The latest stock screen snapshot is incomplete or invalid. Run bin\screen-stock-history.ps1 first.'
    }
    $stockSnapshotRoot = Join-Path $stockScreenRoot $stockScreenMetadata.snapshotId
    $stockSnapshotReport = Get-Content -LiteralPath (Join-Path $stockSnapshotRoot 'report.json') -Raw | ConvertFrom-Json
    if ($stockSnapshotReport.state -ne 'complete' -or $stockSnapshotReport.snapshotId -ne $stockScreenMetadata.snapshotId) {
        throw 'The stock screen report does not match latest.json.'
    }
    foreach ($stockSnapshotFile in @('report.json', 'candidates.json', 'analysis.jsonl')) {
        if (-not (Test-Path -LiteralPath (Join-Path $stockSnapshotRoot $stockSnapshotFile) -PathType Leaf)) {
            throw "Stock screen file is missing: $stockSnapshotFile"
        }
    }
}

if (-not $SkipBuild) {
    foreach ($commandName in @('mvn', 'npm')) {
        if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
            throw "$commandName was not found in PATH."
        }
    }

    Write-Host 'Building RuoYi backend...'
    Push-Location $projectRoot
    try {
        mvn clean package '-Dmaven.test.skip=true'
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
} else {
    Write-Host 'Using existing backend and frontend artifacts; ensure they were built from the intended sources.'
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
& (Join-Path $PSScriptRoot 'prepare-production-jar.ps1') -JarPath (Join-Path $packageRoot 'ruoyi-admin.jar')
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
$packageDocs = Join-Path $packageRoot 'docs'
New-Item -ItemType Directory -Path $packageDocs | Out-Null
foreach ($documentName in @('deploy-stock-screener.md', 'stock-history-download.md', 'agent-chat-deployment.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "docs\$documentName") -Destination $packageDocs
}

Get-ChildItem -LiteralPath (Join-Path $projectRoot 'sql') -Filter '*.sql' -File |
    Where-Object { $_.Name -ne 'jupyterlab_menu.sql' } |
    Copy-Item -Destination (Join-Path $packageRoot 'sql')

$historyToolsDestination = Join-Path $packageRoot 'tools\stock_history'
New-Item -ItemType Directory -Path $historyToolsDestination -Force | Out-Null
foreach ($historyTool in @('import_mysql.py', 'download.py', 'requirements.txt')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "tools\stock_history\$historyTool") -Destination $historyToolsDestination
}
if ($IncludeStockHistory) {
    $historyDestination = Join-Path $packageRoot 'data\stock-history'
    New-Item -ItemType Directory -Path $historyDestination -Force | Out-Null
    $backupCode = "import sqlite3,sys; from pathlib import Path; source=sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True); target=sqlite3.connect(sys.argv[2]); source.backup(target); target.close(); source.close()"
    & python -c $backupCode (Join-Path $projectRoot 'data\stock-history\history.sqlite3') (Join-Path $historyDestination 'history.sqlite3')
    if ($LASTEXITCODE -ne 0) { throw 'SQLite backup failed.' }
    Write-Host 'Included consistent full-market historical SQLite backup for one-time MySQL migration.'
}

if ($IncludeStockScreen) {
    $stockScreenDestination = Join-Path $packageRoot 'data\stock-history\screens'
    $stockSnapshotDestination = Join-Path $stockScreenDestination $stockScreenMetadata.snapshotId
    New-Item -ItemType Directory -Path $stockSnapshotDestination -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $stockScreenRoot 'latest.json') -Destination $stockScreenDestination
    foreach ($stockSnapshotFile in @('report.json', 'candidates.json', 'analysis.jsonl')) {
        Copy-Item -LiteralPath (Join-Path $stockSnapshotRoot $stockSnapshotFile) -Destination $stockSnapshotDestination
    }
    Write-Host "Included stock screen: $($stockScreenMetadata.tradeDate), $($stockScreenMetadata.matchedStocks) candidates."
}

$packageManifest = [ordered]@{
    version = $Version
    createdAt = [DateTimeOffset]::UtcNow.ToString('o')
    includesStockScreen = [bool]$IncludeStockScreen
    includesStockHistory = [bool]$IncludeStockHistory
    marketStorage = 'MySQL; daily RuoYi Quartz jobs at 16:00 and 17:00 Asia/Shanghai'
    embeddedConfigSanitized = $true
    stockScreen = if ($IncludeStockScreen) { [ordered]@{
        snapshotId = $stockScreenMetadata.snapshotId
        tradeDate = $stockScreenMetadata.tradeDate
        universeCount = $stockScreenMetadata.universeCount
        matchedStocks = $stockScreenMetadata.matchedStocks
    } } else { $null }
    preservedOnUpgrade = @('config/*.env', 'config/application*.yml', '/home/wufc/.pi/agent', 'MySQL data')
}
$packageManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $packageRoot 'DEPLOYMENT-MANIFEST.json') -Encoding UTF8

Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $archivePath
$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText("$archivePath.sha256", "$archiveHash  $packageName.zip`n", [System.Text.Encoding]::ASCII)
Write-Host "Deployment package created: $archivePath"

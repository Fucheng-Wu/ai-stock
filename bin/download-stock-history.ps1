param(
    [switch]$Background,
    [switch]$Status,
    [string]$StartDate,
    [string]$EndDate,
    [string]$Symbols,
    [int]$Limit = 0
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$downloadScript = Join-Path $projectRoot 'tools\stock_history\download.py'
$dataDirectory = Join-Path $projectRoot 'data\stock-history'
$pythonCommand = Get-Command python -ErrorAction Stop
$pythonArguments = @($downloadScript, '--data-dir', $dataDirectory)

if ($Status) {
    & $pythonCommand.Source @pythonArguments --status
    exit $LASTEXITCODE
}
if ($StartDate) { $pythonArguments += @('--start', $StartDate) }
if ($EndDate) { $pythonArguments += @('--end', $EndDate) }
if (-not $StartDate -and -not $EndDate -and (Test-Path -LiteralPath (Join-Path $dataDirectory 'history.sqlite3'))) {
    $pythonArguments += '--resume'
}
if ($Symbols) { $pythonArguments += @('--symbols', $Symbols) }
if ($Limit -gt 0) { $pythonArguments += @('--limit', "$Limit") }

if ($Background) {
    $null = New-Item -ItemType Directory -Path $dataDirectory -Force
    $runStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $outputLog = Join-Path $dataDirectory "download-$runStamp.log"
    $errorLog = Join-Path $dataDirectory "download-$runStamp.error.log"
    # Start-Process flattens ArgumentList; quote path/value arguments explicitly.
    $quotedArguments = $pythonArguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }
    $downloadProcess = Start-Process -FilePath $pythonCommand.Source -ArgumentList $quotedArguments `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog
    [ordered]@{ pid = $downloadProcess.Id; log = $outputLog; errorLog = $errorLog; dataDirectory = $dataDirectory } |
        ConvertTo-Json | Tee-Object -FilePath (Join-Path $dataDirectory 'last-process.json')
    exit 0
}

& $pythonCommand.Source @pythonArguments
exit $LASTEXITCODE

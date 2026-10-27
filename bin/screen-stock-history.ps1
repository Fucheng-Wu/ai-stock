param(
    [string]$TradeDate,
    [switch]$ExcludeST
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$screenArguments = @((Join-Path $projectRoot 'tools\stock_history\screen.py'))
if ($TradeDate) { $screenArguments += @('--date', $TradeDate) }
if ($ExcludeST) { $screenArguments += '--exclude-st' }
& python @screenArguments
exit $LASTEXITCODE

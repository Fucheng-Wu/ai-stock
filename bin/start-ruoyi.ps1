$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$jarPath = Join-Path $projectRoot 'ruoyi-admin\target\ruoyi-admin.jar'

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    throw 'Java was not found. Install JDK 17+ and add java to PATH.'
}

if (-not (Test-Path -LiteralPath $jarPath)) {
    throw "$jarPath was not found. Run bin\start-all.ps1 -Prepare first, or build it with Maven."
}

$javaOptions = @(
    '-Xms256m',
    '-Xmx1024m',
    '-XX:MetaspaceSize=128m',
    '-XX:MaxMetaspaceSize=512m'
)

Write-Host 'Starting RuoYi backend: http://localhost:8080'
& java @javaOptions -jar $jarPath
exit $LASTEXITCODE

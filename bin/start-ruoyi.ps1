param(
    [switch]$UseApplicationDatabaseConfig
)

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
$gatewayEnv = Join-Path $projectRoot 'agent-gateway\.env'
$databaseEnvironment = @{}
$previousDatabaseEnvironment = @{}
try {
    # The workbench and gateway share the same database. Keep credentials in the
    # existing ignored .env; do not duplicate them in tracked YAML or CLI arguments.
    if (-not $UseApplicationDatabaseConfig -and (Test-Path -LiteralPath $gatewayEnv)) {
        $gatewayDatabase = @{}
        foreach ($line in (Get-Content -LiteralPath $gatewayEnv)) {
            if ($line -notmatch '^\s*(AGENT_DB_HOST|AGENT_DB_PORT|AGENT_DB_NAME|AGENT_DB_USER|AGENT_DB_PASSWORD)\s*=') { continue }
            $parts = $line.Split('=', 2)
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $gatewayDatabase[$key] = $value
        }
        foreach ($key in @('AGENT_DB_HOST', 'AGENT_DB_PORT', 'AGENT_DB_NAME', 'AGENT_DB_USER', 'AGENT_DB_PASSWORD')) {
            $processValue = [Environment]::GetEnvironmentVariable($key, 'Process')
            if ($null -ne $processValue) { $gatewayDatabase[$key] = $processValue }
        }
        if ($gatewayDatabase.ContainsKey('AGENT_DB_PASSWORD')) {
            $databaseHost = if ($gatewayDatabase['AGENT_DB_HOST']) { $gatewayDatabase['AGENT_DB_HOST'] } else { '127.0.0.1' }
            $databasePort = if ($gatewayDatabase['AGENT_DB_PORT']) { $gatewayDatabase['AGENT_DB_PORT'] } else { '3306' }
            $databaseName = if ($gatewayDatabase['AGENT_DB_NAME']) { $gatewayDatabase['AGENT_DB_NAME'] } else { 'ai_stock' }
            $databaseUser = if ($gatewayDatabase['AGENT_DB_USER']) { $gatewayDatabase['AGENT_DB_USER'] } else { 'root' }
            $databaseEnvironment = @{
                SPRING_DATASOURCE_DRUID_MASTER_URL = "jdbc:mysql://${databaseHost}:${databasePort}/${databaseName}?useUnicode=true&characterEncoding=utf8&zeroDateTimeBehavior=convertToNull&useSSL=true&serverTimezone=GMT%2B8"
                SPRING_DATASOURCE_DRUID_MASTER_USERNAME = $databaseUser
                SPRING_DATASOURCE_DRUID_MASTER_PASSWORD = $gatewayDatabase['AGENT_DB_PASSWORD']
            }
            foreach ($key in $databaseEnvironment.Keys) {
                $previousValue = [Environment]::GetEnvironmentVariable($key, 'Process')
                if ($null -ne $previousValue) { continue }
                $previousDatabaseEnvironment[$key] = $previousValue
                [Environment]::SetEnvironmentVariable($key, $databaseEnvironment[$key], 'Process')
            }
            Write-Host 'Database: using shared local Agent Gateway configuration (credentials hidden).'
        }
    }
    & java @javaOptions -jar $jarPath
    $backendExitCode = $LASTEXITCODE
} finally {
    foreach ($key in $previousDatabaseEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previousDatabaseEnvironment[$key], 'Process')
    }
}
exit $backendExitCode

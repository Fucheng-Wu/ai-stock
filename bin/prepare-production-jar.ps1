param(
    [Parameter(Mandatory = $true)]
    [string]$JarPath
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedJar = (Resolve-Path -LiteralPath $JarPath).Path
$localBuildJar = [IO.Path]::GetFullPath((Join-Path $projectRoot 'ruoyi-admin\target\ruoyi-admin.jar'))
if ([string]::Equals($resolvedJar, $localBuildJar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Production configuration must be prepared on a deployment copy, never on the local build JAR.'
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($resolvedJar, [IO.Compression.ZipArchiveMode]::Update)
try {
    # Keep all runtime defaults and nested Spring Boot libraries intact. Only
    # remove local profiles and replace credential literals in copied YAML.
    $configs = @($archive.Entries | Where-Object { $_.FullName -match '^BOOT-INF/classes/application[^/]*\.ya?ml$' })
    foreach ($entry in $configs) {
        if ($entry.FullName -match '^BOOT-INF/classes/application-(dev|local)\.ya?ml$') {
            $entry.Delete()
            continue
        }
        $entryName = $entry.FullName
        $reader = [IO.StreamReader]::new($entry.Open(), [Text.Encoding]::UTF8)
        try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $passwordVariable = if ($entryName -match 'druid') { 'DB_PASSWORD' } else { 'REDIS_PASSWORD' }
        $redacted = [regex]::Replace($content, '(?m)^([ \t]*)(password|secret|api-key|login-password):[ \t]*([^\r\n]*)', {
            param($match)
            $value = $match.Groups[3].Value.Trim()
            if (-not $value -or $value.StartsWith('#') -or $value.StartsWith('${') -or $value -eq '""' -or $value -eq "''") {
                return $match.Value
            }
            $placeholder = switch ($match.Groups[2].Value) {
                'password' { '${' + $passwordVariable + ':}' }
                'secret' { '${TOKEN_SECRET:CHANGE_THIS_TO_A_LONG_RANDOM_VALUE}' }
                'api-key' { '${DEEPSEEK_API_KEY:}' }
                'login-password' { '${DRUID_CONSOLE_PASSWORD:CHANGE_ME}' }
            }
            return $match.Groups[1].Value + $match.Groups[2].Value + ': ' + $placeholder
        })
        if ($redacted -ne $content) {
            $entry.Delete()
            $replacement = $archive.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
            $writer = [IO.StreamWriter]::new($replacement.Open(), [Text.UTF8Encoding]::new($false))
            try { $writer.Write($redacted) } finally { $writer.Dispose() }
        }
    }
} finally {
    $archive.Dispose()
}
Write-Host 'Deployment JAR prepared: local profiles removed and embedded credentials use environment variables.'

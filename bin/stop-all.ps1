<#
.SYNOPSIS
Stops the local workbench backend, Vue dev server and Agent Gateway process trees.
.EXAMPLE
.\bin\stop-all.ps1
.EXAMPLE
.\bin\stop-all.ps1 -WhatIf
.EXAMPLE
.\bin\stop-all.ps1 -Ports 80,81,8080,3000
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [ValidateRange(1, 65535)]
    [int[]]$Ports = @(80, 8080, 3000)
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\', '/')
$projectPattern = [regex]::Escape($projectRoot.Replace('\', '/')) + '(?:/|["\s;]|$)'

function Test-ProjectPath {
    param([string]$Text)
    return $Text.Replace('\', '/') -imatch $projectPattern
}

function Get-ServiceRole {
    param($Process)
    $command = [string]$Process.CommandLine
    $name = ([string]$Process.Name).ToLowerInvariant()
    if (-not $command) { return $null }

    $isBackend = $name -in @('java.exe', 'javaw.exe') -and
        ($command -match 'com\.ruoyi\.RuoYiApplication\b|(?:^|[\\/\s"])ruoyi-admin\.jar(?:["\s]|$)')
    $belongsToProject = Test-ProjectPath $command
    # IDEA can put the entire classpath in a Java @argument file.
    if ($isBackend -and -not $belongsToProject) {
        foreach ($match in [regex]::Matches($command, '(?:^|\s)@(?:"([^"\r\n]+)"|([^\s"]+))')) {
            $argumentPath = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
            try {
                if ([IO.Path]::IsPathRooted($argumentPath) -and (Test-Path -LiteralPath $argumentPath -PathType Leaf)) {
                    $argumentFile = Get-Item -LiteralPath $argumentPath
                    if ($argumentFile.Length -le 1MB -and (Test-ProjectPath ([IO.File]::ReadAllText($argumentPath)))) {
                        $belongsToProject = $true
                        break
                    }
                }
            } catch { Write-Verbose 'Could not inspect a Java argument file; it will not be assumed to belong to this project.' }
        }
    }
    if (-not $belongsToProject) { return $null }
    if ($isBackend) { return 'Backend' }
    if ($name -eq 'node.exe') {
        if ($command -match 'vue-cli-service' -and $command -match '\bserve\b') { return 'Frontend' }
        if ($command -match 'agent-gateway' -and $command -match '(?:src[\\/]index\.ts|backend[\\/]dist[\\/]index\.js)') { return 'Agent' }
    }
    # These are dedicated terminals created by start-all.ps1, never the IDE or a general terminal.
    if ($name -in @('powershell.exe', 'pwsh.exe') -and
        $command -match '(?i)(?:^|\s)-File\s+"?[^"\r\n]*[\\/]bin[\\/]start-(ruoyi|frontend|agent-gateway)\.ps1(?:"|\s|$)') {
        return 'Service terminal'
    }
    return $null
}

function Get-Listeners {
    return @(Get-NetTCPConnection -State Listen -ErrorAction Stop)
}

Write-Host "Stopping workbench services in: $projectRoot"
Write-Host "Default/custom ports: $($Ports -join ', ')"
$processes = @(Get-CimInstance Win32_Process)
$processIndex = @{}
foreach ($process in $processes) { $processIndex[[int]$process.ProcessId] = $process }

# Never terminate this script, its terminal, the IDE, or any of its ancestors.
$protectedIds = @{}
$ancestorId = [int]$PID
while ($ancestorId -gt 0 -and -not $protectedIds.ContainsKey($ancestorId)) {
    $protectedIds[$ancestorId] = $true
    if (-not $processIndex.ContainsKey($ancestorId)) { break }
    $ancestorId = [int]$processIndex[$ancestorId].ParentProcessId
}

$listeners = Get-Listeners
$services = @{}
foreach ($process in $processes) {
    $processId = [int]$process.ProcessId
    if ($processId -le 4 -or $protectedIds.ContainsKey($processId)) { continue }
    $role = Get-ServiceRole $process
    if ($role) { $services[$processId] = [PSCustomObject]@{ Process = $process; Role = $role } }
}

# A global Vue CLI/npm launcher may contain no checkout path. On explicitly
# selected ports, recognize the service entry point rather than its install path.
foreach ($listener in $listeners | Where-Object { $_.LocalPort -in $Ports }) {
    $ownerId = [int]$listener.OwningProcess
    if ($ownerId -le 4 -or $protectedIds.ContainsKey($ownerId) -or $services.ContainsKey($ownerId) -or -not $processIndex.ContainsKey($ownerId)) { continue }
    $process = $processIndex[$ownerId]
    $command = [string]$process.CommandLine
    $role = $null
    if ($process.Name -eq 'node.exe' -and $command -match 'vue-cli-service' -and $command -match '\bserve\b') { $role = 'Frontend' }
    elseif ($process.Name -in @('java.exe', 'javaw.exe') -and $command -match 'com\.ruoyi\.RuoYiApplication\b|(?:^|[\\/\s"])ruoyi-admin\.jar(?:["\s]|$)') { $role = 'Backend' }
    elseif ($process.Name -eq 'node.exe' -and $command -match 'tsx' -and $command -match 'src[\\/]index\.ts') { $role = 'Agent' }
    if ($role) { $services[$ownerId] = [PSCustomObject]@{ Process = $process; Role = $role } }
}

foreach ($listener in $listeners | Where-Object { $_.LocalPort -in $Ports }) {
    $ownerId = [int]$listener.OwningProcess
    if (-not $services.ContainsKey($ownerId)) {
        $ownerName = if ($processIndex.ContainsKey($ownerId)) { $processIndex[$ownerId].Name } else { 'unknown' }
        Write-Warning "Port $($listener.LocalPort) belongs to $ownerName (PID $ownerId), which is not a recognized workbench service. Skipped."
    }
}

if (-not $services.Count) {
    Write-Host 'No running workbench backend, frontend or Agent service was found.'
    return
}

# Stop each outermost dedicated service tree only once. npm/pnpm/tsx children are included.
$roots = @()
foreach ($processId in @($services.Keys)) {
    $parentId = [int]$services[$processId].Process.ParentProcessId
    $hasServiceAncestor = $false
    $seenParents = @{}
    while ($parentId -gt 0 -and $processIndex.ContainsKey($parentId) -and -not $seenParents.ContainsKey($parentId)) {
        $seenParents[$parentId] = $true
        if ($services.ContainsKey($parentId)) { $hasServiceAncestor = $true; break }
        $parentId = [int]$processIndex[$parentId].ParentProcessId
    }
    if (-not $hasServiceAncestor) { $roots += [int]$processId }
}

$watchedPorts = @($Ports) + @($listeners | Where-Object { $services.ContainsKey([int]$_.OwningProcess) } | ForEach-Object { [int]$_.LocalPort })
$watchedPorts = @($watchedPorts | Sort-Object -Unique)
$failed = $false
foreach ($processId in $roots | Sort-Object) {
    $service = $services[$processId]
    $process = $service.Process
    $ownedPorts = @($listeners | Where-Object { [int]$_.OwningProcess -eq $processId } | Select-Object -ExpandProperty LocalPort -Unique)
    $label = "$($service.Role), PID $processId, $($process.Name)"
    if ($ownedPorts.Count) { $label += ", ports $($ownedPorts -join ', ')" }
    if (-not $PSCmdlet.ShouldProcess($label, 'Stop service process tree')) { continue }
    # Recheck the start time to avoid acting on a PID reused since discovery.
    $currentProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
    if (-not $currentProcess) { continue }
    if ($currentProcess.CreationDate -ne $process.CreationDate) {
        Write-Warning "PID $processId changed after discovery; skipped."
        $failed = $true
        continue
    }
    Write-Host "Stopping $label ..."
    $previousErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & taskkill.exe /PID $processId /T /F
        $stopExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousErrorPreference }
    if ($stopExitCode -ne 0 -and (Get-CimInstance Win32_Process -Filter "ProcessId=$processId")) {
        Write-Warning "Could not stop PID $processId. If access was denied, run this script as administrator."
        $failed = $true
    }
}

if ($WhatIfPreference) {
    Write-Host 'Preview only: no process was stopped.'
    return
}

$remaining = @(Get-Listeners | Where-Object { $_.LocalPort -in $watchedPorts })
foreach ($listener in $remaining) {
    Write-Warning "Port $($listener.LocalPort) is still listening (PID $($listener.OwningProcess))."
}
if ($failed) { throw 'Some services could not be stopped. See the messages above.' }
Write-Host 'Finished stopping recognized workbench services.'
if (-not $remaining.Count) { Write-Host "Ports released: $($watchedPorts -join ', ')" }

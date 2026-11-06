# Uses mocked Windows process APIs. No real process is terminated.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$stopScript = Join-Path $repoRoot 'bin/stop-all.ps1'
$fixtureCreated = [datetime]'2026-11-05T09:00:00'
function Assert-StopScript {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}
function New-FixtureProcess {
    param([int]$Id, [int]$Parent, [string]$Name, [string]$Command)
    return [PSCustomObject]@{ ProcessId=$Id; ParentProcessId=$Parent; Name=$Name; CommandLine=$Command; CreationDate=$fixtureCreated }
}
$fixtureProcesses = @(
    (New-FixtureProcess $PID 9900 'pwsh.exe' "pwsh -File `"$repoRoot\bin\start-frontend.ps1`""),
    (New-FixtureProcess 9900 0 'Code.exe' 'IDE'),
    (New-FixtureProcess 7000 9900 'java.exe' "java -jar `"$repoRoot\ruoyi-admin\target\ruoyi-admin.jar`""),
    (New-FixtureProcess 7001 7000 'java.exe' "java -jar `"$repoRoot\ruoyi-admin\target\ruoyi-admin.jar`""),
    (New-FixtureProcess 7200 9900 'java.exe' "java -cp `"$repoRoot\ruoyi-admin\target\classes`" com.ruoyi.RuoYiApplication"),
    (New-FixtureProcess 8100 9900 'powershell.exe' "powershell -NoExit -File `"$repoRoot\bin\start-agent-gateway.ps1`""),
    (New-FixtureProcess 8110 8100 'node.exe' "node `"$repoRoot\agent-gateway\node_modules\tsx\cli.mjs`" src/index.ts"),
    (New-FixtureProcess 8111 8110 'node.exe' "node `"$repoRoot\agent-gateway\node_modules\tsx\loader.mjs`" src/index.ts"),
    (New-FixtureProcess 8200 9900 'node.exe' 'node C:\global\node_modules\@vue\cli-service\bin\vue-cli-service.js serve'),
    (New-FixtureProcess 8300 9900 'node.exe' 'node C:\other\unrelated-server.js'),
    (New-FixtureProcess 8400 9900 'node.exe' 'node C:\other\ruoyi-ui\node_modules\@vue\cli-service\bin\vue-cli-service.js serve'),
    (New-FixtureProcess 8500 9900 'node.exe' "node `"$repoRoot\tools\some-other-tool.js`"")
)
$fixtureListeners = @(
    [PSCustomObject]@{LocalPort=8080; OwningProcess=7001},
    [PSCustomObject]@{LocalPort=8081; OwningProcess=7200},
    [PSCustomObject]@{LocalPort=3000; OwningProcess=8111},
    [PSCustomObject]@{LocalPort=80; OwningProcess=8200},
    [PSCustomObject]@{LocalPort=4444; OwningProcess=8300},
    [PSCustomObject]@{LocalPort=5173; OwningProcess=8400}
)
$global:stopScriptFixture = [PSCustomObject]@{Stopped=@(); Terminated=@{}}
function Get-CimInstance {
    param([string]$ClassName, [string]$Filter)
    $rows = @($fixtureProcesses | Where-Object { -not $global:stopScriptFixture.Terminated.ContainsKey([int]$_.ProcessId) })
    if ($Filter -match 'ProcessId=(\d+)') { return $rows | Where-Object { $_.ProcessId -eq [int]$Matches[1] } }
    return $rows
}
function Get-NetTCPConnection {
    param([string]$State, $ErrorAction)
    return @($fixtureListeners | Where-Object { -not $global:stopScriptFixture.Terminated.ContainsKey([int]$_.OwningProcess) })
}
function taskkill.exe {
    $targetIndex = [array]::IndexOf($args, '/PID') + 1
    Assert-StopScript ($targetIndex -gt 0) 'taskkill must select a specific PID'
    Assert-StopScript ($args -contains '/T') 'taskkill must stop the selected service tree'
    $selected = [int]$args[$targetIndex]
    $global:stopScriptFixture.Stopped += $selected
    $global:stopScriptFixture.Terminated[$selected] = $true
    do {
        $newlyStopped = 0
        foreach ($row in $fixtureProcesses) {
            if ($global:stopScriptFixture.Terminated.ContainsKey([int]$row.ParentProcessId) -and -not $global:stopScriptFixture.Terminated.ContainsKey([int]$row.ProcessId)) {
                $global:stopScriptFixture.Terminated[[int]$row.ProcessId] = $true; $newlyStopped++
            }
        }
    } while ($newlyStopped)
    $global:LASTEXITCODE = 0
}

& $stopScript -Ports @(80,8080,3000,4444) -WhatIf
Assert-StopScript ($global:stopScriptFixture.Stopped.Count -eq 0) 'WhatIf terminated a process'
& $stopScript -Ports @(80,8080,3000,4444)
Assert-StopScript ((@($global:stopScriptFixture.Stopped | Sort-Object) -join ',') -eq '7000,7200,8100,8200') 'Wrong service trees were selected'
foreach ($protectedId in @($PID,9900,8300,8400,8500)) {
    Assert-StopScript (-not $global:stopScriptFixture.Terminated.ContainsKey($protectedId)) "Unrelated/IDE/self process $protectedId was selected"
}
Assert-StopScript ($global:stopScriptFixture.Terminated.ContainsKey(8111)) 'Agent child survived its launcher tree'
Assert-StopScript ($global:stopScriptFixture.Terminated.ContainsKey(7001)) 'Backend child survived its wrapper tree'
Write-Host 'PASS: preview, default/custom ports, global Vue CLI, IDE backend, process-tree deduplication, unrelated processes and caller protection.'

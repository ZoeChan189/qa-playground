param([ValidateRange(1024, 65535)][int]$Port = 4173)
$ErrorActionPreference = 'Stop'
try {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::1', '::') } |
        Select-Object -First 1
    if (!$listener) {
        Write-Host "No QA Lab server is listening on port $Port."
        exit 0
    }
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
    if ($health.service -ne 'qa-lab') { throw "Port $Port belongs to another app. Nothing was stopped." }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($process.Name -ne 'node.exe' -or $process.CommandLine -notmatch '(^|[\s"\\/])src[\\/]server\.js([\s"]|$)') {
        throw 'The listener is not an identifiable QA Lab Node server. Nothing was stopped.'
    }
    $latest = $null
    try { $latest = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/perf/runs/latest" -TimeoutSec 3 }
    catch { Write-Host 'Older server: current k6 state could not be read.' }
    if ($latest.run.status -eq 'running') { throw 'A k6 test is still running. Wait for it to finish, then stop QA Lab again.' }
    $current = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
        Where-Object OwningProcess -eq $listener.OwningProcess
    if (!$current) { throw 'The listener changed while checking. Nothing was stopped.' }
    Stop-Process -Id $listener.OwningProcess -ErrorAction Stop
    Write-Host "Stopped QA Lab on port $Port. Other Node apps were not stopped." -ForegroundColor Green
    Write-Host 'You can now update this folder and rerun setup-windows.cmd.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

param([Parameter(Mandatory = $true)][string]$Uri)
$ErrorActionPreference = 'Stop'
$logDir = Join-Path $env:LOCALAPPDATA 'QA Lab\logs'
$logPath = Join-Path $logDir 'connection.log'
try {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $configuredOrigin = [Environment]::GetEnvironmentVariable('LOCAL_BRIDGE_ORIGIN', 'User')
    if ($configuredOrigin) { $env:LOCAL_BRIDGE_ORIGIN = $configuredOrigin }
    $project = Split-Path -Parent $PSScriptRoot
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js is missing. Run setup-windows.cmd in the latest QA Lab folder first.' }
    # Native stderr must be captured even when Windows PowerShell promotes it to an error.
    $ErrorActionPreference = 'Continue'
    $output = (& node.exe (Join-Path $project 'src\cli\connect-local.js') $Uri 2>&1 | Out-String)
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($exitCode -ne 0) { throw $output.Trim() }
} catch {
    $message = $_.Exception.Message -replace '(?i)[a-f0-9]{64}', '[redacted]'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Add-Content -LiteralPath $logPath -Value ((Get-Date -Format s) + ' ' + $message)
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($message + "`n`nDetails: " + $logPath, 'QA Lab connection') | Out-Null
    exit 1
}

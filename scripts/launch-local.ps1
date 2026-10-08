param([Parameter(Mandatory = $true)][string]$Uri)
$ErrorActionPreference = 'Stop'
try {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $configuredOrigin = [Environment]::GetEnvironmentVariable('LOCAL_BRIDGE_ORIGIN', 'User')
    if ($configuredOrigin) { $env:LOCAL_BRIDGE_ORIGIN = $configuredOrigin }
    $project = Split-Path -Parent $PSScriptRoot
    & node.exe (Join-Path $project 'src\cli\connect-local.js') $Uri
    if ($LASTEXITCODE -ne 0) { throw 'Local connection failed. Run setup-windows.cmd again, or close an older QA Lab window and retry.' }
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'QA Lab connection') | Out-Null
    exit 1
}

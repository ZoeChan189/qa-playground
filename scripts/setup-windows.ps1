$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
function Refresh-UserPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
}
try {
    Refresh-UserPath
    if (!(Get-Command node.exe -ErrorAction SilentlyContinue) -or !(Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        Write-Host 'Installing Node.js LTS for this Windows user...'
        & winget.exe install --id OpenJS.NodeJS.LTS --exact --source winget --scope user --accept-package-agreements --accept-source-agreements --disable-interactivity
        if ($LASTEXITCODE -ne 0) { throw 'Install Node.js LTS from https://nodejs.org/en/download, then run setup again.' }
        Refresh-UserPath
    }
    & node.exe -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
    if ($LASTEXITCODE -ne 0) { throw 'Node.js 20+ is required. Update Node.js, then run setup again.' }
    if (!(Get-Command k6.exe -ErrorAction SilentlyContinue)) {
        Write-Host 'Installing the official Grafana k6 portable release for this Windows user...'
        $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/grafana/k6/releases/latest'
        $asset = $release.assets | Where-Object { $_.name -match '^k6-v.+-windows-amd64\.zip$' } | Select-Object -First 1
        if (!$asset) { throw 'No Windows k6 download found. Install k6 from https://grafana.com/docs/k6/latest/set-up/install-k6/' }
        $tempFolder = Join-Path ([IO.Path]::GetTempPath()) ('qa-lab-setup-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tempFolder | Out-Null
        $zip = Join-Path $tempFolder 'k6.zip'
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
        if ($asset.digest -match '^sha256:(.+)$' -and (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $Matches[1]) { throw 'k6 download checksum did not match.' }
        Expand-Archive -LiteralPath $zip -DestinationPath $tempFolder
        $binary = Get-ChildItem -LiteralPath $tempFolder -Filter k6.exe -Recurse | Select-Object -First 1
        if (!$binary) { throw 'The k6 download did not contain k6.exe.' }
        $installFolder = Join-Path $env:LOCALAPPDATA 'Programs\k6'
        New-Item -ItemType Directory -Path $installFolder -Force | Out-Null
        Copy-Item -LiteralPath $binary.FullName -Destination (Join-Path $installFolder 'k6.exe') -Force
        $userPaths = @([Environment]::GetEnvironmentVariable('Path', 'User') -split ';' | Where-Object { $_ })
        if ($userPaths -notcontains $installFolder) { [Environment]::SetEnvironmentVariable('Path', (($userPaths + $installFolder) -join ';'), 'User') }
        Refresh-UserPath
        Remove-Item -LiteralPath $zip
    }
    & k6.exe version
    if ($LASTEXITCODE -ne 0) { throw 'k6 could not start. Reinstall Grafana k6, then run setup again.' }
    Push-Location -LiteralPath $project
    try {
        Write-Host 'Installing QA Lab dependencies...'
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Check your internet connection, then run setup again.' }
    } finally { Pop-Location }
    $key = 'HKCU:\Software\Classes\qalab'
    New-Item -Path "$key\shell\open\command" -Force | Out-Null
    Set-Item -LiteralPath $key -Value 'URL:QA Lab Local Connector'
    New-ItemProperty -LiteralPath $key -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
    $launcher = Join-Path $PSScriptRoot 'launch-local.ps1'
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    Set-Item -LiteralPath "$key\shell\open\command" -Value ('"' + $powershell + '" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '" -Uri "%1"')
    Write-Host 'Setup complete. Open the hosted QA Lab and click Connect k6. Allow Windows to open QA Lab.' -ForegroundColor Green
    Write-Host 'Keep this project folder in place. If you move it, run setup-windows.cmd again.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

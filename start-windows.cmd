@echo off
cd /d "%~dp0"
for /f "usebackq delims=" %%P in (`powershell.exe -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')"`) do set "PATH=%%P"
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_node
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit((major===20&&minor>=19)||(major===22&&minor>=12)||major>=24?0:1)"
if errorlevel 1 goto old_node

if not exist node_modules (
  echo Installing project dependencies...
  call npm ci
  if errorlevel 1 goto install_failed
)
if not defined K6_BIN (
  where k6 >nul 2>nul
  if errorlevel 1 echo Optional for performance runs: install k6 from https://grafana.com/docs/k6/latest/set-up/install-k6/
)
set "QA_LAB_OPEN_BROWSER=1"
echo Starting QA Lab at http://localhost:4173
call npm start
pause
exit /b %errorlevel%

:missing_node
echo Node.js and npm are required. Install Node.js LTS from https://nodejs.org/en/download
pause
exit /b 2

:old_node
echo Update Node.js LTS at https://nodejs.org/en/download
echo Supported versions: 20.19+, 22.12+, or 24+; not 21/23.
pause
exit /b 2

:install_failed
echo Dependency installation failed. Check your internet connection and try again.
pause
exit /b 2

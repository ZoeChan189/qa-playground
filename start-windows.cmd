@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 goto old_node

if not exist node_modules (
  echo Installing project dependencies...
  call npm ci
  if errorlevel 1 goto install_failed
)
where k6 >nul 2>nul
if errorlevel 1 echo Optional for performance runs: install k6 from https://grafana.com/docs/k6/latest/set-up/install-k6/
set "QA_LAB_OPEN_BROWSER=1"
echo Starting QA Lab at http://localhost:4173
call npm start
pause
exit /b %errorlevel%

:missing_node
echo Node.js and npm are required. Install Node.js 20+ from https://nodejs.org/en/download
pause
exit /b 2

:old_node
echo Node.js 20 or newer is required. Update it at https://nodejs.org/en/download
pause
exit /b 2

:install_failed
echo Dependency installation failed. Check your internet connection and try again.
pause
exit /b 2

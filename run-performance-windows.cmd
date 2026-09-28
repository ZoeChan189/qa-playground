@echo off
setlocal
cd /d "%~dp0"

if not exist package.json goto missing_project
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 goto missing_node
if not defined K6_BIN (
  where k6 >nul 2>nul
  if errorlevel 1 goto missing_k6
)
node -e "fetch('http://127.0.0.1:4173/api/health', {signal: AbortSignal.timeout(3000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
if errorlevel 1 goto missing_server

:menu
echo.
echo QA Lab - performance test on THIS computer
echo 1 Load    2 Stress    3 Spike    4 Soak    5 Stress + Spike + Soak    X Exit
choice /c 12345X /n /m "Choose: "
if errorlevel 6 goto end
if errorlevel 5 goto all_main
if errorlevel 4 goto soak
if errorlevel 3 goto spike
if errorlevel 2 goto stress
if errorlevel 1 goto load

:load
call npm run perf:load
goto after_run
:stress
call npm run perf:stress
goto after_run
:spike
call npm run perf:spike
goto after_run
:soak
call npm run perf:soak
goto after_run
:all_main
call npm run perf:stress
call npm run perf:spike
call npm run perf:soak
goto after_run

:after_run
echo.
echo Open the newest JSON files in the results folder with Open summary on the local web.
echo A failed threshold means the measured limit was crossed; inspect the JSON file.
pause
goto menu

:missing_project
echo This file must be in the same folder as package.json and start-windows.cmd.
goto stop
:missing_node
echo Install Node.js 20 or newer from https://nodejs.org/en/download and reopen this window.
goto stop
:missing_k6
echo Install Grafana k6 from https://grafana.com/docs/k6/latest/set-up/install-k6/
echo Reopen this window after installation.
goto stop
:missing_server
echo Start start-windows.cmd first and keep that window open.
echo Then open http://localhost:4173/ and run this file again.
goto stop
:stop
pause
:end
endlocal

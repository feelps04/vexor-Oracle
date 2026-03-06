@echo off
echo ============================================================
echo   SENTINEL - Iniciando todos os servicos (SAFE)
echo ============================================================
echo.
echo [0/5] Liberando portas...
call :KillPort 5174
call :KillPort 3000
call :KillPort 8765
call :KillPort 10208
call :KillPort 10209
timeout /t 1 /nobreak >nul

echo.
echo [1/5] Iniciando Python API (8765)...
cd /d "%~dp0packages\sentinel-api"
start "Python API" cmd /c "python sentinel_api.py"
call :WaitPort 8765 30

echo.
echo [2/5] Iniciando Geckos.io (10208)...
cd /d "%~dp0packages\webtransport-server"
start "Geckos.io" cmd /c "npx tsx src/index-geckos.ts"
call :WaitPort 10208 30

echo.
echo [3/5] Iniciando UDP Bridge (10209)...
cd /d "%~dp0packages\sentinel-api"
start "UDP Bridge" cmd /c "python bridge_udp.py"
call :WaitUdpPort 10209 15

echo.
echo [4/5] Iniciando API Node.js (3000)...
cd /d "%~dp0packages\api"
start "API Node.js" cmd /c "node dist/app.js"
call :WaitPort 3000 30

echo.
echo [5/5] Iniciando Vite (5174)...
cd /d "%~dp0packages\web"
start "Vite" cmd /c "npx vite --port 5174 --strictPort"
call :WaitPort 5174 30

echo.
echo ============================================================
echo   Todos os servicos iniciados!
echo ============================================================
echo.
echo   Vite:     http://localhost:5174
echo   API Node: http://localhost:3000
echo   Python:   http://localhost:8765
echo   Geckos:   porta 10208 (WebRTC)
echo   UDP:      porta 10209 (Bridge)
echo ============================================================
echo.
echo   Pressione qualquer tecla para abrir o navegador...
pause >nul
start http://localhost:5174

goto :eof

:KillPort
set "PORT=%~1"
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`) do (
  if not "%%P"=="" (
    powershell -NoProfile -Command "Stop-Process -Id %%P -Force -ErrorAction SilentlyContinue" >nul 2>nul
  )
)
goto :eof

:WaitPort
set "PORT=%~1"
set "MAX=%~2"
set /a "I=0"
:WaitPortLoop
powershell -NoProfile -Command "$c=(Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue | Measure-Object).Count; if ($c -ge 1) { exit 1 } else { exit 0 }" >nul 2>nul
if "%errorlevel%"=="1" goto :eof
set /a "I+=1"
if %I% GEQ %MAX% goto :eof
timeout /t 1 /nobreak >nul
goto :WaitPortLoop

:WaitUdpPort
set "PORT=%~1"
set "MAX=%~2"
set /a "I=0"
:WaitUdpPortLoop
for /f "usebackq delims=" %%C in (`netstat -ano ^| findstr ":%PORT%" ^| findstr "UDP"`) do goto :eof
set /a "I+=1"
if %I% GEQ %MAX% goto :eof
timeout /t 1 /nobreak >nul
goto :WaitUdpPortLoop

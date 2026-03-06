@echo off
echo ============================================================
echo Sentinel - Iniciando todos os servicos
echo ============================================================

:: 1. Mata processos antigos
taskkill /F /IM python.exe 2>nul
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

:: 2. Inicia API Python
cd /d "%~dp0packages\sentinel-api"
start "Sentinel API" cmd /k python sentinel_api.py
echo [OK] Sentinel API iniciada na porta 8765

:: 3. Aguarda API inicializar
timeout /t 3 /nobreak >nul

:: 4. Inicia Geckos Server
cd /d "%~dp0packages\webtransport-server"
start "Geckos Server" cmd /k node dist/index-geckos.js
echo [OK] Geckos Server iniciado na porta 10208

:: 5. Aguarda Geckos inicializar
timeout /t 2 /nobreak >nul

:: 6. Inicia Bridge UDP
cd /d "%~dp0packages\sentinel-api"
start "Bridge UDP" cmd /k python bridge_udp.py
echo [OK] Bridge UDP iniciado

:: 7. Inicia Frontend (opcional)
cd /d "%~dp0packages\web"
start "Frontend" cmd /k npm run dev
echo [OK] Frontend iniciado na porta 3000

echo ============================================================
echo Todos os servicos iniciados!
echo - API: http://127.0.0.1:8765
echo - Geckos: http://127.0.0.1:10208
echo - Frontend: http://localhost:3000
echo ============================================================
pause

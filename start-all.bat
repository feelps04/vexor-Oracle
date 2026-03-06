@echo off
echo ============================================================
echo   VEXOR - Iniciando todos os servicos
echo ============================================================

set "ROOT=%~dp0"

:: Carrega variaveis de ambiente do .env se existir
if exist "%ROOT%.env" (
  echo Carregando variaveis de ambiente do .env...
  for /f "usebackq tokens=1,* delims==" %%a in ("%ROOT%.env") do (
    set "%%a=%%b"
  )
)

:: Verifica Supabase
if "%SUPABASE_URL%"=="" (
  echo.
  echo [AVISO] SUPABASE_URL nao configurado!
  echo Para usar Supabase, crie um arquivo .env na raiz com:
  echo   SUPABASE_URL=https://seu-projeto.supabase.co
  echo   SUPABASE_ANON_KEY=sua-anon-key
  echo   SUPABASE_SERVICE_KEY=sua-service-role-key
  echo   DATABASE_URL=postgresql://postgres:senha@db.seu-projeto.supabase.co:5432/postgres
  echo.
  echo Ou execute: setup-supabase-social.bat URL KEY
  echo.
)

:: Mata processos antigos
taskkill /F /IM node.exe 2>nul
taskkill /F /IM python.exe 2>nul
timeout /t 2 /nobreak >nul

:: Limpa arquivos JS gerados que conflitam com TSX
echo [0/6] Limpando arquivos JS gerados...
cd /d "%ROOT%packages\web\src"
del /s /q *.js *.js.map 2>nul
cd /d "%ROOT%"
echo Arquivos JS removidos.

:: Inicia API Node.js (porta 3000)
echo [1/6] Iniciando API Node.js...
cd /d "%ROOT%packages\api"
call npm run build
cd /d "%ROOT%"
start "API Node.js" cmd /c "node packages/api/dist/app.js"
timeout /t 3 /nobreak >nul

:: Inicia Python API (porta 8765)
echo [2/6] Iniciando Python API...
cd /d "%ROOT%packages\sentinel-api"
start "Python API" cmd /c "python sentinel_api.py"
timeout /t 3 /nobreak >nul

:: Inicia Geckos.io (porta 10208)
echo [3/6] Iniciando Geckos.io...
cd /d "%ROOT%packages\webtransport-server"
start "Geckos.io" cmd /c "node dist/index-geckos.js"
timeout /t 3 /nobreak >nul

:: Inicia UDP Bridge (porta 10209)
echo [4/6] Iniciando UDP Bridge...
cd /d "%ROOT%packages\sentinel-api"
start "UDP Bridge" cmd /c "python bridge_udp.py"
timeout /t 2 /nobreak >nul

:: Inicia Vite (porta 5174)
echo [5/6] Iniciando Vite...
cd /d "%ROOT%packages\web"
start "Vite" cmd /c "npm run dev -- --port 5174 --host 127.0.0.1"
timeout /t 3 /nobreak >nul

:: Verifica Supabase Social Tables
echo [6/6] Verificando Supabase Social Tables...
if "%SUPABASE_URL%" NEQ "" (
  echo Supabase configurado. Tabelas sociais serao usadas.
) else (
  echo Modo local: usando banco PostgreSQL local se disponivel.
)

echo ============================================================
echo   Todos os servicos iniciados!
echo ============================================================
echo.
echo   Vite:     http://localhost:5174
echo   Social:   http://localhost:5174/social
echo   API Node: http://localhost:3000
echo   Python:   http://localhost:8765
echo   Geckos:   porta 10208 (WebRTC)
echo   UDP:      porta 10209 (Bridge)
echo.
if "%SUPABASE_URL%" NEQ "" (
  echo   Supabase: %SUPABASE_URL%
)
echo ============================================================
echo.
echo   Para configurar Supabase:
echo   1. Acesse: https://supabase.com/dashboard
echo   2. Va em SQL Editor
echo   3. Cole o conteudo de: packages\api\supabase-social-schema.sql
echo   4. Execute o script
echo.
echo   Pressione qualquer tecla para abrir o navegador...
pause >nul
start http://localhost:5174

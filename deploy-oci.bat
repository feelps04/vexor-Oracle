@echo off
echo ============================================================
echo   VEXOR - Deploy para Oracle Cloud Infrastructure
echo ============================================================

set "ROOT=%~dp0"

:: Carrega variaveis de ambiente
if exist "%ROOT%.env" (
  echo Carregando variaveis de ambiente...
  for /f "usebackq tokens=1,* delims==" %%a in ("%ROOT%.env") do (
    set "%%a=%%b"
  )
)

:: Verifica OCI CLI
where oci >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERRO] OCI CLI nao encontrado. Instale com: pip install oci-cli
  pause
  exit /b 1
)

:: Verifica configuracao OCI
if not exist "%USERPROFILE%\.oci\config" (
  echo [ERRO] Configuracao OCI nao encontrada em %USERPROFILE%\.oci\config
  pause
  exit /b 1
)

echo.
echo Verificando conexao com OCI...
oci iam compartment list --compartment-id-in-subtree true --limit 1 >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERRO] Falha ao conectar com OCI. Verifique suas credenciais.
  pause
  exit /b 1
)

echo Conexao OCI OK!
echo.

:: Build do projeto
echo [1/4] Build do projeto web...
cd /d "%ROOT%packages\web"
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo [ERRO] Falha no build do web
  pause
  exit /b 1
)

echo [2/4] Build do projeto api...
cd /d "%ROOT%packages\api"
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo [ERRO] Falha no build da api
  pause
  exit /b 1
)

echo [3/4] Preparando arquivos para deploy...
cd /d "%ROOT%"
if exist "deploy-temp" rd /s /q "deploy-temp"
mkdir "deploy-temp"
mkdir "deploy-temp\api"
mkdir "deploy-temp\web"

:: Copia arquivos da API
xcopy /s /e /q "%ROOT%packages\api\dist" "deploy-temp\api\"
xcopy /s /e /q "%ROOT%packages\api\package*.json" "deploy-temp\api\"
xcopy /s /e /q "%ROOT%packages\api\node_modules" "deploy-temp\api\node_modules\"

:: Copia arquivos do Web
xcopy /s /e /q "%ROOT%packages\web\dist" "deploy-temp\web\"

echo [4/4] Deploy para OCI...

:: Aqui voce pode adicionar comandos especificos para:
:: - Upload para Object Storage
:: - Deploy para Container Instances
:: - Deploy para Kubernetes (OKE)
:: - Deploy para Compute VM

echo.
echo ============================================================
echo   Deploy preparado em: %ROOT%deploy-temp
echo ============================================================
echo.
echo Proximos passos:
echo   1. Configure o compartment OCI: set COMPARTMENT_ID=ocid1.compartment...
echo   2. Para Object Storage: oci os object put -bn vexor-bucket --file deploy-temp
echo   3. Para Container: docker build -t vexor . ^&^& docker push
echo   4. Para Compute: scp -r deploy-temp opc@^<instance-ip^>:~/vexor
echo.
pause

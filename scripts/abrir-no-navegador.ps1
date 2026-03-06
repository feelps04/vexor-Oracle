# Abre o sistema no navegador (PowerShell)
# 1. Corrige package.json vazio em load-test (ja feito)
# 2. Instala dependencias
# 3. Sobe o frontend (Vite) - abra http://localhost:5173

$ErrorActionPreference = "Stop"
$node = "C:\Users\Genial\Desktop\nodejs\node.exe"
$npm  = "C:\Users\Genial\Desktop\nodejs\npm.cmd"
$root = "C:\Users\Genial\Desktop\transaction-auth-engine"

Set-Location $root

Write-Host "Instalando dependencias..." -ForegroundColor Yellow
& $npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Iniciando frontend (Vite). Abra http://localhost:5173 no navegador." -ForegroundColor Green
& $npm run dev

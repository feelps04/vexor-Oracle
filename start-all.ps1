# Script para iniciar todos os serviços do Sentinel
# Uso: .\start-all.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SENTINEL - Iniciando todos serviços  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ErrorActionPreference = "SilentlyContinue"

# Função para verificar se uma porta está em uso
function Test-Port {
    param($Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

# 1. Verificar/Iniciar Redis
Write-Host "`n[1/4] Verificando Redis..." -ForegroundColor Yellow
if (Test-Port 6379) {
    Write-Host "  Redis já está rodando na porta 6379" -ForegroundColor Green
} else {
    Write-Host "  Tentando iniciar Redis..." -ForegroundColor Yellow
    # Tenta iniciar via redis-server (se instalado)
    $redisProcess = Start-Process -FilePath "redis-server" -ArgumentList "--daemonize yes" -PassThru -ErrorAction SilentlyContinue
    if ($redisProcess) {
        Start-Sleep -Seconds 2
        if (Test-Port 6379) {
            Write-Host "  Redis iniciado!" -ForegroundColor Green
        }
    } else {
        Write-Host "  Redis não encontrado. Continuando sem Redis (modo degradado)" -ForegroundColor DarkYellow
    }
}

# 2. Compilar e iniciar API
Write-Host "`n[2/4] Iniciando API (porta 3000)..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\packages\api"

# Compilar se necessário
if (-not (Test-Path "dist")) {
    Write-Host "  Compilando API..." -ForegroundColor DarkGray
    npm run build 2>&1 | Out-Null
}

# Verificar se já está rodando
if (Test-Port 3000) {
    Write-Host "  API já está rodando na porta 3000" -ForegroundColor Green
} else {
    Write-Host "  Iniciando API..." -ForegroundColor DarkGray
    Start-Process -FilePath "node" -ArgumentList "dist/app.js" -WindowStyle Hidden
    Start-Sleep -Seconds 3
    if (Test-Port 3000) {
        Write-Host "  API iniciada! http://localhost:3000" -ForegroundColor Green
    } else {
        Write-Host "  Falha ao iniciar API. Execute manualmente:" -ForegroundColor Red
        Write-Host "    cd packages/api && npm run build && npm start" -ForegroundColor White
    }
}

# 3. Iniciar Web (Vite)
Write-Host "`n[3/4] Iniciando Web (Vite dev server)..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\packages\web"

# Verificar se já está rodando
if (Test-Port 5173) {
    Write-Host "  Web já está rodando na porta 5173" -ForegroundColor Green
} else {
    Write-Host "  Iniciando Vite..." -ForegroundColor DarkGray
    Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WindowStyle Minimized
    Start-Sleep -Seconds 3
    if (Test-Port 5173) {
        Write-Host "  Web iniciada! http://localhost:5173" -ForegroundColor Green
    } else {
        Write-Host "  Falha ao iniciar Web. Execute manualmente:" -ForegroundColor Red
        Write-Host "    cd packages/web && npm run dev" -ForegroundColor White
    }
}

# 4. Iniciar stock-price-producer
Write-Host "`n[4/4] Iniciando stock-price-producer..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\packages\stock-price-producer"

# Compilar se necessário
if (-not (Test-Path "dist")) {
    Write-Host "  Compilando producer..." -ForegroundColor DarkGray
    npm run build 2>&1 | Out-Null
}

Write-Host "  Iniciando producer (MMF mode)..." -ForegroundColor DarkGray
Start-Process -FilePath "node" -ArgumentList "dist/main.js" -WindowStyle Minimized
Write-Host "  Producer iniciado!" -ForegroundColor Green

# Voltar ao diretório raiz
Set-Location $PSScriptRoot

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  SERVIÇOS INICIADOS!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  API:     http://localhost:3000" -ForegroundColor White
Write-Host "  Web:     http://localhost:5173" -ForegroundColor White
Write-Host "  Redis:   localhost:6379 (opcional)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Para parar todos os serviços:" -ForegroundColor Yellow
Write-Host "    Get-Process node,redis-server -ErrorAction SilentlyContinue | Stop-Process" -ForegroundColor White
Write-Host ""

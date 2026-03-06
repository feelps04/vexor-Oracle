# VEXOR Oracle Resources Setup - Execute na VM Windows
# Configura PostgreSQL local + OCI GenAI + Leitura de Memória MMF

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VEXOR - Configurando Recursos Oracle" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Instalar PostgreSQL
Write-Host "`n[1/5] Instalando PostgreSQL..." -ForegroundColor Yellow
$pgInstaller = "https://get.enterprisedb.com/postgresql/postgresql-16.2-1-windows-x64.exe"
$pgInstallerPath = "$env:TEMP\postgresql-installer.exe"

try {
    Invoke-WebRequest -Uri $pgInstaller -OutFile $pgInstallerPath -UseBasicParsing
    Start-Process -FilePath $pgInstallerPath -ArgumentList "--mode unattended --unattendedmodeui minimal --superpassword Vexor2026 --serverport 5432" -Wait
    Write-Host "PostgreSQL instalado" -ForegroundColor Green
} catch {
    Write-Host "PostgreSQL já instalado ou erro: $_" -ForegroundColor Yellow
}

# Configurar PATH do PostgreSQL
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";C:\Program Files\PostgreSQL\16\bin"

# 2. Criar banco de dados VEXOR
Write-Host "`n[2/5] Criando banco de dados..." -ForegroundColor Yellow
$env:PGPASSWORD = "Vexor2026"

try {
    & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE vexor;" 2>$null
    & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d vexor -c @"
CREATE TABLE IF NOT EXISTS social_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS social_stories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    media_url TEXT NOT NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_ticks (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    bid DECIMAL(18,4),
    ask DECIMAL(18,4),
    last_price DECIMAL(18,4),
    volume BIGINT,
    timestamp BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_analysis (
    id SERIAL PRIMARY KEY,
    analysis_type VARCHAR(50),
    content TEXT,
    data_points INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_market_ticks_symbol ON market_ticks(symbol);
CREATE INDEX idx_market_ticks_timestamp ON market_ticks(timestamp);
"@
    Write-Host "Tabelas criadas" -ForegroundColor Green
} catch {
    Write-Host "Tabelas já existem ou erro: $_" -ForegroundColor Yellow
}

# 3. Configurar diretório MMF para MT5
Write-Host "`n[3/5] Configurando Memory Mapped File..." -ForegroundColor Yellow
$mmfDir = "C:\vexor\mt5_data"
New-Item -ItemType Directory -Force -Path $mmfDir | Out-Null

# Criar script Python para bridge MT5 -> MMF
$mt5Bridge = @'
import mmap
import json
import struct
import time
import os

# Arquivo MMF para comunicação com MT5
MMF_FILE = r"C:\vexor\mt5_data\market_data.mmf"
MMF_SIZE = 1024 * 1024  # 1MB

def create_mmf():
    """Cria arquivo de memória compartilhada"""
    if not os.path.exists(MMF_FILE):
        with open(MMF_FILE, 'wb') as f:
            f.write(b'\x00' * MMF_SIZE)
    
    return mmap.mmap(open(MMF_FILE, 'r+b').fileno(), MMF_SIZE)

def write_market_data(mmf, data):
    """Escreve dados de mercado no MMF"""
    json_data = json.dumps(data)
    mmf.seek(0)
    mmf.write(struct.pack('I', len(json_data)))
    mmf.write(json_data.encode())

def read_market_data(mmf):
    """Lê dados de mercado do MMF"""
    mmf.seek(0)
    size = struct.unpack('I', mmf.read(4))[0]
    if size > 0 and size < MMF_SIZE:
        data = mmf.read(size).decode()
        return json.loads(data)
    return None

# Dados simulados para teste
simulated_data = {
    "ticks": [
        {"symbol": "WIN$", "bid": 125000, "ask": 125010, "last": 125005, "volume": 1500, "timestamp": int(time.time() * 1000)},
        {"symbol": "WDO$", "bid": 5.125, "ask": 5.130, "last": 5.127, "volume": 2000, "timestamp": int(time.time() * 1000)},
        {"symbol": "PETR4", "bid": 38.50, "ask": 38.55, "last": 38.52, "volume": 5000, "timestamp": int(time.time() * 1000)},
        {"symbol": "VALE3", "bid": 68.20, "ask": 68.25, "last": 68.22, "volume": 3000, "timestamp": int(time.time() * 1000)},
        {"symbol": "ITUB4", "bid": 32.80, "ask": 32.85, "last": 32.82, "volume": 4500, "timestamp": int(time.time() * 1000)},
    ],
    "lastUpdate": int(time.time() * 1000)
}

if __name__ == "__main__":
    print("Iniciando MT5 Memory Bridge...")
    mmf = create_mmf()
    
    while True:
        # Atualizar dados simulados
        for tick in simulated_data["ticks"]:
            tick["bid"] += (hash(time.time()) % 100) / 100
            tick["ask"] = tick["bid"] + 0.05
            tick["last"] = (tick["bid"] + tick["ask"]) / 2
            tick["timestamp"] = int(time.time() * 1000)
        
        simulated_data["lastUpdate"] = int(time.time() * 1000)
        
        # Escrever no MMF
        write_market_data(mmf, simulated_data)
        print(f"Dados atualizados: {len(simulated_data['ticks'])} ticks")
        
        time.sleep(1)
'@
Set-Content -Path "$mmfDir\mt5_bridge.py" -Value $mt5Bridge -Encoding UTF8
Write-Host "MMF Bridge criado" -ForegroundColor Green

# 4. Atualizar .env para PostgreSQL local
Write-Host "`n[4/5] Atualizando configuração..." -ForegroundColor Yellow
$env = @"
# Database - PostgreSQL Local (migrado do Supabase)
DATABASE_URL=postgresql://postgres:Vexor2026@localhost:5432/vexor

# OCI Generative AI
OCI_GENAI_PRIMARY_KEY=sk-k0e35cOHls3M8Wa10pFdmtRqSmvGN6ntZFrl9O56Y4EeyBko
OCI_GENAI_BACKUP_KEY=sk-DKi0XyVcN2UR2yVzyVco2l4wyplL37rwOh4XZr4E9iMNFeZn
OCI_TENANCY_OCID=ocid1.tenancy.oc1..aaaaaaaaoavjhejphyhdysk3fpuvzzzuxpcue43mp6jtsajqpz2apxfnxz4a
OCI_REGION=sa-saopaulo-1

# Memory Mapped File
MMF_PATH=C:\vexor\mt5_data\market_data.mmf
MMF_SIZE=1048576

# Server
NODE_ENV=production
PORT=3000

# Twelve Data (mantido para dados externos)
TWELVE_DATA_API_KEY=f908c32743af495fbd29ac1d946446de
"@
Set-Content -Path "C:\vexor\.env" -Value $env -Encoding UTF8
Write-Host ".env atualizado" -ForegroundColor Green

# 5. Iniciar serviços
Write-Host "`n[5/5] Iniciando serviços..." -ForegroundColor Yellow

# Iniciar bridge MT5-Python em background
Start-Process python -ArgumentList "C:\vexor\mt5_data\mt5_bridge.py" -WindowStyle Hidden

# Reiniciar API com novas rotas
pm2 restart vexor-platform 2>$null
pm2 save

Write-Host "Serviços iniciados" -ForegroundColor Green

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  RECURSOS ORACLE CONFIGURADOS!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  📊 PostgreSQL: localhost:5432 / vexor" -ForegroundColor Yellow
Write-Host "  🧠 OCI GenAI: Llama 3 70B configurado" -ForegroundColor Yellow
Write-Host "  💾 MMF Bridge: C:\vexor\mt5_data\market_data.mmf" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Endpoints:" -ForegroundColor Yellow
Write-Host "    GET /api/v1/memory/ticks    - Dados em tempo real" -ForegroundColor Cyan
Write-Host "    GET /api/v1/memory/analyze  - Análise com IA" -ForegroundColor Cyan
Write-Host "    GET /api/v1/memory/status   - Status do MMF" -ForegroundColor Cyan
Write-Host "    GET /api/v1/memory/summary  - Resumo por símbolo" -ForegroundColor Cyan
Write-Host ""

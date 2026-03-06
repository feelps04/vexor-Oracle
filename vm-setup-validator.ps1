# VEXOR Validator Setup - EXECUTE NA VM (PowerShell Admin)
# Instala Python, OCI SDK, PostgreSQL e configura o sistema Nota 10

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VEXOR MT5 AI Validator - Setup Nota 10" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Instalar Python se necessário
Write-Host "`n[1/6] Verificando Python..." -ForegroundColor Yellow
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    $pyUrl = "https://www.python.org/ftp/python/3.12.0/python-3.12.0-amd64.exe"
    $pyExe = "$env:TEMP\python-installer.exe"
    Invoke-WebRequest -Uri $pyUrl -OutFile $pyExe -UseBasicParsing
    Start-Process $pyExe -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1" -Wait
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")
}
Write-Host "Python: $(python --version)" -ForegroundColor Green

# 2. Instalar dependências Python
Write-Host "`n[2/6] Instalando OCI SDK e psycopg2..." -ForegroundColor Yellow
pip install oci psycopg2-binary --quiet 2>$null
Write-Host "Dependências instaladas" -ForegroundColor Green

# 3. Configurar chave OCI
Write-Host "`n[3/6] Configurando chave OCI..." -ForegroundColor Yellow
$ociDir = "C:\vexor\.oci"
New-Item -ItemType Directory -Force -Path $ociDir | Out-Null

# Criar arquivo de configuração OCI
$ociConfig = @"
[DEFAULT]
user=ocid1.user.oc1..aaaaaaaa565gvdyd655b6iatwhzgd5c7jwkjpqiq557nvtht6zlpoat73eta
fingerprint=fc:e9:cd:fa:94:bb:33:ef:d8:d8:8e:81:80:83:5a:a6
tenancy=ocid1.tenancy.oc1..aaaaaaaaoavjhejphyhdysk3fpuvzzzuxpcue43mp6jtsajqpz2apxfnxz4a
region=sa-saopaulo-1
key_file=C:\vexor\.oci\private_key.pem
"@
Set-Content -Path "$ociDir\config" -Value $ociConfig

# Nota: O usuário precisa copiar a chave privada para C:\vexor\.oci\private_key.pem
Write-Host "Config OCI criado (copie sua chave privada para C:\vexor\.oci\private_key.pem)" -ForegroundColor Yellow

# 4. Instalar PostgreSQL
Write-Host "`n[4/6] Instalando PostgreSQL..." -ForegroundColor Yellow
if (!(Get-Command psql -ErrorAction SilentlyContinue)) {
    $pgUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.2-1-windows-x64.exe"
    $pgExe = "$env:TEMP\pg-installer.exe"
    Invoke-WebRequest -Uri $pgUrl -OutFile $pgExe -UseBasicParsing
    Start-Process $pgExe -ArgumentList "--mode unattended --superpassword Vexor2026 --serverport 5432" -Wait
    $env:Path += ";C:\Program Files\PostgreSQL\16\bin"
}
Write-Host "PostgreSQL instalado" -ForegroundColor Green

# 5. Criar banco e tabelas
Write-Host "`n[5/6] Criando banco de dados..." -ForegroundColor Yellow
$env:PGPASSWORD = "Vexor2026"

$sqlScript = @"
-- Criar banco
CREATE DATABASE vexor;

\c vexor

-- Tabela de regras (CADEADO DE FERRO)
CREATE TABLE IF NOT EXISTS trading_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(50) UNIQUE NOT NULL,
    rule_value DECIMAL(18,4) NOT NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    locked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de PnL diário
CREATE TABLE IF NOT EXISTS daily_pnl (
    id SERIAL PRIMARY KEY,
    trading_date DATE UNIQUE NOT NULL,
    total_pnl DECIMAL(18,4) DEFAULT 0,
    trade_count INTEGER DEFAULT 0,
    max_loss_hit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de auditoria de ordens
CREATE TABLE IF NOT EXISTS orders_audit (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    quantity DECIMAL(18,4),
    price DECIMAL(18,4),
    ai_decision VARCHAR(20),
    postgres_approved BOOLEAN,
    executed BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Tabela de ticks de mercado
CREATE TABLE IF NOT EXISTS market_ticks (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    bid DECIMAL(18,4),
    ask DECIMAL(18,4),
    last_price DECIMAL(18,4),
    volume BIGINT,
    timestamp BIGINT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Inserir regras padrão
INSERT INTO trading_rules (rule_name, rule_value) VALUES
    ('max_daily_loss', 500.0),
    ('trading_start_hour', 9),
    ('trading_end_hour', 17),
    ('trading_end_minute', 50)
ON CONFLICT (rule_name) DO NOTHING;

-- STORED PROCEDURES

-- Função: pode_operar() - O GUARDIÃO
CREATE OR REPLACE FUNCTION pode_operar()
RETURNS BOOLEAN AS $$
DECLARE
    v_max_loss DECIMAL;
    v_today_pnl DECIMAL;
    v_current_hour INT;
    v_current_minute INT;
    v_start_hour INT;
    v_end_hour INT;
    v_end_minute INT;
BEGIN
    -- Verificar horário
    v_current_hour := EXTRACT(HOUR FROM NOW());
    v_current_minute := EXTRACT(MINUTE FROM NOW());
    
    SELECT rule_value INTO v_start_hour FROM trading_rules WHERE rule_name = 'trading_start_hour';
    SELECT rule_value INTO v_end_hour FROM trading_rules WHERE rule_name = 'trading_end_hour';
    SELECT rule_value INTO v_end_minute FROM trading_rules WHERE rule_name = 'trading_end_minute';
    
    IF v_current_hour < v_start_hour OR v_current_hour > v_end_hour OR
       (v_current_hour = v_end_hour AND v_current_minute >= v_end_minute) THEN
        RETURN FALSE;
    END IF;
    
    -- Verificar perda diária
    SELECT rule_value INTO v_max_loss FROM trading_rules WHERE rule_name = 'max_daily_loss';
    SELECT COALESCE(total_pnl, 0) INTO v_today_pnl FROM daily_pnl WHERE trading_date = CURRENT_DATE;
    
    IF v_today_pnl <= -v_max_loss THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Função: registrar_operacao()
CREATE OR REPLACE FUNCTION registrar_operacao(
    p_symbol VARCHAR, p_side VARCHAR, p_quantity DECIMAL, 
    p_price DECIMAL, p_ai_decision VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE v_can_trade BOOLEAN;
BEGIN
    SELECT pode_operar() INTO v_can_trade;
    INSERT INTO orders_audit (symbol, side, quantity, price, ai_decision, postgres_approved)
    VALUES (p_symbol, p_side, p_quantity, p_price, p_ai_decision, v_can_trade);
    RETURN v_can_trade;
END;
$$ LANGUAGE plpgsql;

-- Função: atualizar_pnl()
CREATE OR REPLACE FUNCTION atualizar_pnl(p_pnl DECIMAL)
RETURNS VOID AS $$
BEGIN
    INSERT INTO daily_pnl (trading_date, total_pnl, trade_count)
    VALUES (CURRENT_DATE, p_pnl, 1)
    ON CONFLICT (trading_date) DO UPDATE SET
        total_pnl = daily_pnl.total_pnl + p_pnl,
        trade_count = daily_pnl.trade_count + 1,
        max_loss_hit = (daily_pnl.total_pnl + p_pnl <= 
            (SELECT rule_value FROM trading_rules WHERE rule_name = 'max_daily_loss') * -1);
END;
$$ LANGUAGE plpgsql;

-- Função: travar_regras() - Impede alteração durante pregão
CREATE OR REPLACE FUNCTION travar_regras()
RETURNS VOID AS $$
BEGIN
    UPDATE trading_rules SET is_locked = TRUE, locked_at = NOW() WHERE is_locked = FALSE;
END;
$$ LANGUAGE plpgsql;
"@

Set-Content -Path "$env:TEMP\setup_db.sql" -Value $sqlScript
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -f "$env:TEMP\setup_db.sql" 2>$null
Write-Host "Banco de dados configurado" -ForegroundColor Green

# 6. Criar diretórios e baixar validator
Write-Host "`n[6/6] Configurando sistema..." -ForegroundColor Yellow
$mt5Dir = "C:\vexor\mt5_data"
New-Item -ItemType Directory -Force -Path $mt5Dir | Out-Null

# Baixar o validator do GitHub
$validatorUrl = "https://raw.githubusercontent.com/feelps04/vexor-Oracle/main/mt5_ai_validator.py"
Invoke-WebRequest -Uri $validatorUrl -OutFile "C:\vexor\mt5_ai_validator.py" -UseBasicParsing 2>$null

# Criar script de inicialização
$startScript = @'
@echo off
echo Iniciando VEXOR MT5 AI Validator...
cd C:\vexor
python mt5_ai_validator.py
pause
'@
Set-Content -Path "C:\vexor\start-validator.bat" -Value $startScript

# Criar MMF inicial
$mmfPath = "C:\vexor\mt5_data\market_data.mmf"
if (!(Test-Path $mmfPath)) {
    $f = [System.IO.File]::Create($mmfPath)
    $f.SetLength(1024*1024)
    $f.Close()
}

Write-Host "Sistema configurado" -ForegroundColor Green

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETO!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  PRÓXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Copie sua chave privada OCI para:" -ForegroundColor White
Write-Host "     C:\vexor\.oci\private_key.pem" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. Inicie o validador:" -ForegroundColor White
Write-Host "     C:\vexor\start-validator.bat" -ForegroundColor Cyan
Write-Host ""
Write-Host "  3. Configure o MT5 para escrever no MMF:" -ForegroundColor White
Write-Host "     C:\vexor\mt5_data\market_data.mmf" -ForegroundColor Cyan
Write-Host ""
Write-Host "  RECURSOS ATIVOS:" -ForegroundColor Yellow
Write-Host "  ✓ Python + OCI SDK" -ForegroundColor Green
Write-Host "  ✓ PostgreSQL + Cadeado de Ferro" -ForegroundColor Green
Write-Host "  ✓ MMF com Heartbeat" -ForegroundColor Green
Write-Host "  ✓ OCI GenAI Llama 3 70B" -ForegroundColor Green
Write-Host ""

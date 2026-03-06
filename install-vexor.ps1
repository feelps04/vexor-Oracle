# VEXOR Installation Script for Windows Server
# Run this on the OCI VM

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VEXOR - Instalacao no Windows Server" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Install Node.js
Write-Host "`n[1/5] Instalando Node.js..." -ForegroundColor Yellow
$nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
$nodeMsi = "$env:TEMP\node.msi"

Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi
Start-Process msiexec.exe -ArgumentList "/i $nodeMsi /qn" -Wait
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Refresh environment
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "Node.js instalado: $(node --version)" -ForegroundColor Green

# Install PM2 for process management
Write-Host "`n[2/5] Instalando PM2..." -ForegroundColor Yellow
npm install -g pm2 windows-build-tools
Write-Host "PM2 instalado" -ForegroundColor Green

# Create project directory
Write-Host "`n[3/5] Criando diretorios..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "C:\vexor"
New-Item -ItemType Directory -Force -Path "C:\vexor\logs"
Write-Host "Diretorios criados" -ForegroundColor Green

# Configure firewall
Write-Host "`n[4/5] Configurando Firewall..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "VEXOR API" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "VEXOR Web" -Direction Inbound -LocalPort 5174 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "HTTP" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "HTTPS" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
Write-Host "Firewall configurado" -ForegroundColor Green

# Create .env file
Write-Host "`n[5/5] Criando arquivo de ambiente..." -ForegroundColor Yellow
$envContent = @"
TWELVE_DATA_API_KEY=f908c32743af495fbd29ac1d946446de

# Supabase Configuration
SUPABASE_URL=https://tonwuegoyftfgfpkbvop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnd1ZWdveWZ0ZmdmcGtidm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0ODA4ODEsImV4cCI6MjA4ODA1Njg4MX0.tsholJQFV_pKFajDsGHLUYnOD959TJSvXxYvNxs7pc8
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnd1ZWdveWZ0ZmdmcGtidm9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ4MDg4MSwiZXhwIjoyMDg4MDU2ODgxfQ.9APp09YzrQoQNEVnhnfvNHgfM1dovMxP_ajEol0GzbA

# Database URL (Supabase PostgreSQL)
DATABASE_URL=postgresql://postgres:G0Qg5TKjabVxnicn@db.tonwuegoyftfgfpkbvop.supabase.co:5432/postgres

# Market Data
MARKET_DATA_URL=http://localhost:8765

# Oracle Cloud Infrastructure (OCI)
OCI_USER_OCID=ocid1.user.oc1..aaaaaaaa565gvdyd655b6iatwhzgd5c7jwkjpqiq557nvtht6zlpoat73eta
OCI_TENANCY_OCID=ocid1.tenancy.oc1..aaaaaaaaoavjhejphyhdysk3fpuvzzzuxpcue43mp6jtsajqpz2apxfnxz4a
OCI_FINGERPRINT=fc:e9:cd:fa:94:bb:33:ef:d8:d8:8e:81:80:83:5a:a6
OCI_REGION=sa-saopaulo-1
OCI_KEY_FILE=C:\vexor\.oci\private_key.pem

# OCI Generative AI Keys
OCI_GENAI_PRIMARY_KEY=sk-k0e35cOHls3M8Wa10pFdmtRqSmvGN6ntZFrl9O56Y4EeyBko
OCI_GENAI_BACKUP_KEY=sk-DKi0XyVcN2UR2yVzyVco2l4wyplL37rwOh4XZr4E9iMNFeZn

# Production
NODE_ENV=production
PORT=3000
"@

Set-Content -Path "C:\vexor\.env" -Value $envContent
Write-Host "Arquivo .env criado" -ForegroundColor Green

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  Instalacao concluida!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Yellow
Write-Host "  1. Copie o projeto para C:\vexor"
Write-Host "  2. Execute: cd C:\vexor && npm install"
Write-Host "  3. Execute: npm run build"
Write-Host "  4. Execute: pm2 start ecosystem.config.js"
Write-Host ""
Write-Host "URLs:" -ForegroundColor Yellow
Write-Host "  API: http://132.226.166.206:3000"
Write-Host "  Web: http://132.226.166.206"
Write-Host ""

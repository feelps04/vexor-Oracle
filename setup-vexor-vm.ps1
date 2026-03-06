# VEXOR Setup Script - Execute DIRETAMENTE na VM via RDP
# Copie este arquivo para a VM e execute como Administrator

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VEXOR - Configuracao do Servidor" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Install Node.js
Write-Host "`n[1/6] Instalando Node.js..." -ForegroundColor Yellow
$nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
$nodeMsi = "$env:TEMP\node.msi"

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i $nodeMsi /qn" -Wait
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
Write-Host "Node.js: $(node --version 2>$null)" -ForegroundColor Green

# 2. Install PM2
Write-Host "`n[2/6] Instalando PM2..." -ForegroundColor Yellow
npm install -g pm2 2>$null
Write-Host "PM2 instalado" -ForegroundColor Green

# 3. Create directories
Write-Host "`n[3/6] Criando diretorios..." -ForegroundColor Yellow
$dirs = @(
    "C:\vexor",
    "C:\vexor\packages\api\dist",
    "C:\vexor\packages\web\dist",
    "C:\vexor\packages\core\dist",
    "C:\vexor\packages\shared\dist",
    "C:\vexor\logs"
)
foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
Write-Host "Diretorios criados" -ForegroundColor Green

# 4. Create .env file
Write-Host "`n[4/6] Criando .env..." -ForegroundColor Yellow
$envContent = @"
TWELVE_DATA_API_KEY=f908c32743af495fbd29ac1d946446de
SUPABASE_URL=https://tonwuegoyftfgfpkbvop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnd1ZWdveWZ0ZmdmcGtidm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0ODA4ODEsImV4cCI6MjA4ODA1Njg4MX0.tsholJQFV_pKFajDsGHLUYnOD959TJSvXxYvNxs7pc8
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnd1ZWdveWZ0ZmdmcGtidm9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ4MDg4MSwiZXhwIjoyMDg4MDU2ODgxfQ.9APp09YzrQoQNEVnhnfvNHgfM1dovMxP_ajEol0GzbA
DATABASE_URL=postgresql://postgres:G0Qg5TKjabVxnicn@db.tonwuegoyftfgfpkbvop.supabase.co:5432/postgres
MARKET_DATA_URL=http://localhost:8765
OCI_USER_OCID=ocid1.user.oc1..aaaaaaaa565gvdyd655b6iatwhzgd5c7jwkjpqiq557nvtht6zlpoat73eta
OCI_TENANCY_OCID=ocid1.tenancy.oc1..aaaaaaaaoavjhejphyhdysk3fpuvzzzuxpcue43mp6jtsajqpz2apxfnxz4a
OCI_FINGERPRINT=fc:e9:cd:fa:94:bb:33:ef:d8:d8:8e:81:80:83:5a:a6
OCI_REGION=sa-saopaulo-1
OCI_GENAI_PRIMARY_KEY=sk-k0e35cOHls3M8Wa10pFdmtRqSmvGN6ntZFrl9O56Y4EeyBko
OCI_GENAI_BACKUP_KEY=sk-DKi0XyVcN2UR2yVzyVco2l4wyplL37rwOh4XZr4E9iMNFeZn
NODE_ENV=production
PORT=3000
"@
Set-Content -Path "C:\vexor\.env" -Value $envContent -Encoding UTF8
Write-Host ".env criado" -ForegroundColor Green

# 5. Configure Firewall
Write-Host "`n[5/6] Configurando Firewall..." -ForegroundColor Yellow
$ports = @(3000, 80, 443, 5174, 8765)
foreach ($port in $ports) {
    New-NetFirewallRule -DisplayName "VEXOR Port $port" -Direction Inbound -LocalPort $port -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null
}
Write-Host "Firewall configurado" -ForegroundColor Green

# 6. Enable WinRM for remote management
Write-Host "`n[6/6] Habilitando WinRM..." -ForegroundColor Yellow
winrm quickconfig -q 2>$null
winrm set winrm/config/client '@{TrustedHosts="*"}' 2>$null
Enable-PSRemoting -Force -ErrorAction SilentlyContinue
Write-Host "WinRM habilitado" -ForegroundColor Green

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  CONFIGURACAO CONCLUIDA!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Agora copie os arquivos do projeto para C:\vexor" -ForegroundColor Yellow
Write-Host "Ou execute o script de deploy da maquina local" -ForegroundColor Yellow
Write-Host ""
Write-Host "URLs:" -ForegroundColor Yellow
Write-Host "  API: http://132.226.166.206:3000" -ForegroundColor Cyan
Write-Host "  Web: http://132.226.166.206" -ForegroundColor Cyan
Write-Host ""

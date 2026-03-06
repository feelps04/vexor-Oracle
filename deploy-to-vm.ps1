# VEXOR Deploy Script - Run from LOCAL machine
# Copies project to OCI VM and starts services

param(
    [string]$IP = "132.226.166.206",
    [string]$User = "opc",
    [string]$Password = "L26112004Lf@"
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VEXOR - Deploy para OCI VM" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$projectPath = "C:\Users\Bete\Desktop\projeto-sentinel"
$remotePath = "C:\vexor"

# Create PSCredential
$secPassword = ConvertTo-SecureString $Password -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential($User, $secPassword)

# Test connection
Write-Host "`n[1/6] Testando conexao..." -ForegroundColor Yellow
try {
    $session = New-PSSession -ComputerName $IP -Credential $credential -ErrorAction Stop
    Write-Host "Conexao OK!" -ForegroundColor Green
} catch {
    Write-Host "Erro de conexao: $_" -ForegroundColor Red
    Write-Host "Verifique se WinRM esta habilitado na VM" -ForegroundColor Yellow
    exit 1
}

# Install Node.js on VM
Write-Host "`n[2/6] Instalando Node.js na VM..." -ForegroundColor Yellow
Invoke-Command -Session $session -ScriptBlock {
    if (!(Get-Command node -ErrorAction SilentlyContinue)) {
        $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
        $nodeMsi = "$env:TEMP\node.msi"
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi
        Start-Process msiexec.exe -ArgumentList "/i $nodeMsi /qn" -Wait
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    }
    node --version
}
Write-Host "Node.js instalado" -ForegroundColor Green

# Create directories
Write-Host "`n[3/6] Criando diretorios..." -ForegroundColor Yellow
Invoke-Command -Session $session -ScriptBlock {
    New-Item -ItemType Directory -Force -Path "C:\vexor" | Out-Null
    New-Item -ItemType Directory -Force -Path "C:\vexor\packages\api" | Out-Null
    New-Item -ItemType Directory -Force -Path "C:\vexor\packages\web" | Out-Null
    New-Item -ItemType Directory -Force -Path "C:\vexor\packages\core" | Out-Null
    New-Item -ItemType Directory -Force -Path "C:\vexor\packages\shared" | Out-Null
}
Write-Host "Diretorios criados" -ForegroundColor Green

# Copy project files
Write-Host "`n[4/6] Copiando arquivos..." -ForegroundColor Yellow
Copy-Item -ToSession $session -Path "$projectPath\package.json" -Destination "C:\vexor\" -Force
Copy-Item -ToSession $session -Path "$projectPath\tsconfig.base.json" -Destination "C:\vexor\" -Force
Copy-Item -ToSession $session -Path "$projectPath\.env" -Destination "C:\vexor\" -Force
Copy-Item -ToSession $session -Path "$projectPath\packages\api\*" -Destination "C:\vexor\packages\api\" -Recurse -Force
Copy-Item -ToSession $session -Path "$projectPath\packages\web\dist" -Destination "C:\vexor\packages\web\" -Recurse -Force
Copy-Item -ToSession $session -Path "$projectPath\packages\core\*" -Destination "C:\vexor\packages\core\" -Recurse -Force
Copy-Item -ToSession $session -Path "$projectPath\packages\shared\*" -Destination "C:\vexor\packages\shared\" -Recurse -Force
Write-Host "Arquivos copiados" -ForegroundColor Green

# Install dependencies and start
Write-Host "`n[5/6] Instalando dependencias e iniciando..." -ForegroundColor Yellow
Invoke-Command -Session $session -ScriptBlock {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    cd C:\vexor
    
    # Install npm globally
    npm install -g pm2
    
    # Install dependencies
    npm install --workspaces --include-workspace-root
    
    # Create PM2 ecosystem
    $pm2Config = @"
module.exports = {
  apps: [{
    name: 'vexor-api',
    cwd: 'C:/vexor/packages/api',
    script: 'dist/app.js',
    instances: 1,
    autorestart: true,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
"@
    Set-Content -Path "C:\vexor\ecosystem.config.js" -Value $pm2Config
    
    # Start API
    pm2 start ecosystem.config.js
    pm2 save
}
Write-Host "Servicos iniciados" -ForegroundColor Green

# Configure firewall
Write-Host "`n[6/6] Configurando firewall..." -ForegroundColor Yellow
Invoke-Command -Session $session -ScriptBlock {
    New-NetFirewallRule -DisplayName "VEXOR API" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "VEXOR Web" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
}
Write-Host "Firewall configurado" -ForegroundColor Green

Remove-PSSession $session

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  DEPLOY CONCLUIDO!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  URL Publica: http://$IP" -ForegroundColor Yellow
Write-Host "  API: http://$IP`:3000" -ForegroundColor Yellow
Write-Host "  Social: http://$IP/social" -ForegroundColor Yellow
Write-Host ""

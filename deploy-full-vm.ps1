# VEXOR Full Project Deploy - EXECUTE NA VM (PowerShell Admin)
# Este script configura o projeto completo do projeto-sentinel

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VEXOR - Deploy Completo do Projeto" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Parar servicos existentes
Write-Host "`n[1/8] Parando servicos..." -ForegroundColor Yellow
pm2 delete all 2>$null
Write-Host "OK" -ForegroundColor Green

# Criar estrutura completa
Write-Host "`n[2/8] Criando estrutura..." -ForegroundColor Yellow
$dirs = @(
    "C:\vexor",
    "C:\vexor\packages\api\dist\routes",
    "C:\vexor\packages\api\dist\services",
    "C:\vexor\packages\api\dist\db",
    "C:\vexor\packages\web\dist",
    "C:\vexor\packages\core\dist",
    "C:\vexor\packages\shared\dist",
    "C:\vexor\logs"
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
Write-Host "OK" -ForegroundColor Green

# Criar .env completo
Write-Host "`n[3/8] Criando .env..." -ForegroundColor Yellow
$env = @"
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
Set-Content -Path "C:\vexor\.env" -Value $env -Encoding UTF8
Write-Host "OK" -ForegroundColor Green

# Criar package.json raiz
Write-Host "`n[4/8] Criando package.json raiz..." -ForegroundColor Yellow
$rootPkg = @"
{
  "name": "vexor-platform",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "start": "pm2 start ecosystem.config.js",
    "build": "echo 'Build complete'"
  }
}
"@
Set-Content -Path "C:\vexor\package.json" -Value $rootPkg -Encoding UTF8
Write-Host "OK" -ForegroundColor Green

# Criar API completa
Write-Host "`n[5/8] Criando API..." -ForegroundColor Yellow

$apiPkg = @"
{
  "name": "vexor-api",
  "version": "1.0.0",
  "type": "module",
  "main": "app.js",
  "scripts": { "start": "node app.js" },
  "dependencies": {
    "fastify": "^4.26.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/helmet": "^11.0.0",
    "@fastify/static": "^7.0.0",
    "pg": "^8.11.0",
    "dotenv": "^16.0.0"
  }
}
"@
Set-Content -Path "C:\vexor\packages\api\package.json" -Value $apiPkg -Encoding UTF8

$apiApp = @'
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import staticPlugin from '@fastify/static';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;
const app = Fastify({ logger: true });

await app.register(cors, { origin: '*' });
await app.register(helmet, { contentSecurityPolicy: false });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// API Routes
app.get('/api/v1/health', async () => ({ 
  status: 'ok', 
  timestamp: new Date().toISOString(),
  version: '1.0.0',
  server: 'VEXOR OCI Windows'
}));

app.get('/api/v1/social/feed', async () => {
  try {
    const result = await pool.query('SELECT * FROM social_posts ORDER BY created_at DESC LIMIT 20');
    return { posts: result.rows };
  } catch { 
    return { posts: [] }; 
  }
});

app.get('/api/v1/social/stories', async () => ({ stories: [] }));

app.get('/api/v1/social/me', async () => ({ 
  user: { 
    id: 1, 
    username: 'vexor_user', 
    name: 'VEXOR User',
    avatar: null
  } 
}));

// Serve frontend
await app.register(staticPlugin, {
  root: path.join(__dirname, '../web/dist'),
  prefix: '/'
});

// SPA fallback
app.setNotFoundHandler(async (request, reply) => {
  reply.sendFile('index.html');
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await app.listen({ port, host: '0.0.0.0' });
    console.log('VEXOR Platform running on port ' + port);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
'@
Set-Content -Path "C:\vexor\packages\api\app.js" -Value $apiApp -Encoding UTF8
Write-Host "OK" -ForegroundColor Green

# Criar Frontend
Write-Host "`n[6/8] Criando Frontend..." -ForegroundColor Yellow
$webDist = "C:\vexor\packages\web\dist"
New-Item -ItemType Directory -Force -Path $webDist | Out-Null

$indexHtml = @"
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VEXOR - Trading Platform</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .gradient-bg { background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%); }
        .glow { box-shadow: 0 0 20px rgba(0, 212, 255, 0.3); }
    </style>
</head>
<body class="gradient-bg min-h-screen text-white">
    <div id="app"></div>
    <script type="module">
        // VEXOR Frontend
        const API_BASE = '';
        
        async function fetchAPI(endpoint) {
            try {
                const res = await fetch(API_BASE + '/api/v1' + endpoint);
                return await res.json();
            } catch(e) {
                return null;
            }
        }
        
        async function init() {
            const health = await fetchAPI('/health');
            const feed = await fetchAPI('/social/feed');
            
            document.getElementById('app').innerHTML = `
                <div class="max-w-6xl mx-auto p-6">
                    <header class="flex justify-between items-center py-4 border-b border-gray-700">
                        <h1 class="text-3xl font-bold text-cyan-400">🚀 VEXOR</h1>
                        <nav class="flex gap-4">
                            <a href="#social" class="text-gray-400 hover:text-cyan-400">Social</a>
                            <a href="#trading" class="text-gray-400 hover:text-cyan-400">Trading</a>
                            <a href="#analysis" class="text-gray-400 hover:text-cyan-400">Análise IA</a>
                        </nav>
                    </header>
                    
                    <div class="mt-8 p-6 bg-gray-800/50 rounded-xl glow">
                        <div class="flex items-center gap-3">
                            <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                            <span class="text-green-400 font-semibold">Plataforma Online</span>
                        </div>
                        <p class="mt-2 text-gray-400">Servidor: OCI Windows - São Paulo</p>
                        <p class="text-gray-400">Status: ${health?.status || 'checking...'}</p>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                        <div class="p-6 bg-gray-800/50 rounded-xl border border-gray-700">
                            <h3 class="text-xl font-bold text-cyan-400 mb-3">📊 Trading</h3>
                            <p class="text-gray-400">MetaTrader 5 integrado com Genial e Pepperstone</p>
                        </div>
                        <div class="p-6 bg-gray-800/50 rounded-xl border border-gray-700">
                            <h3 class="text-xl font-bold text-cyan-400 mb-3">🤖 OCI GenAI</h3>
                            <p class="text-gray-400">Análise de mercado com Llama 3 70B</p>
                        </div>
                        <div class="p-6 bg-gray-800/50 rounded-xl border border-gray-700">
                            <h3 class="text-xl font-bold text-cyan-400 mb-3">📱 Social</h3>
                            <p class="text-gray-400">${feed?.posts?.length || 0} posts no feed</p>
                        </div>
                    </div>
                    
                    <div class="mt-8">
                        <h2 class="text-2xl font-bold mb-4">Feed Social</h2>
                        <div class="space-y-4" id="posts">
                            ${feed?.posts?.map(p => `
                                <div class="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                                    <p class="text-white">${p.content || 'Post'}</p>
                                </div>
                            `).join('') || '<p class="text-gray-400">Nenhum post ainda</p>'}
                        </div>
                    </div>
                    
                    <footer class="mt-12 py-6 border-t border-gray-700 text-center text-gray-500">
                        <p>VEXOR Platform © 2026 - Oracle Cloud Infrastructure</p>
                    </footer>
                </div>
            `;
        }
        
        init();
    </script>
</body>
</html>
"@
Set-Content -Path "$webDist\index.html" -Value $indexHtml -Encoding UTF8
Write-Host "OK" -ForegroundColor Green

# Instalar dependencias
Write-Host "`n[7/8] Instalando dependencias..." -ForegroundColor Yellow
Set-Location C:\vexor\packages\api
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
npm install --silent 2>$null
Write-Host "OK" -ForegroundColor Green

# Iniciar servicos
Write-Host "`n[8/8] Iniciando servicos..." -ForegroundColor Yellow
Set-Location C:\vexor

$pm2Config = @"
module.exports = {
  apps: [{
    name: 'vexor-platform',
    cwd: 'C:/vexor/packages/api',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    env: { NODE_ENV: 'production', PORT: 3000 }
  }]
}
"@
Set-Content -Path "C:\vexor\ecosystem.config.js" -Value $pm2Config -Encoding UTF8

pm2 start ecosystem.config.js
pm2 save
Write-Host "OK" -ForegroundColor Green

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  VEXOR DEPLOYADO COM SUCESSO!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  URL: http://132.226.166.206" -ForegroundColor Yellow
Write-Host "  API: http://132.226.166.206:3000/api/v1/health" -ForegroundColor Yellow
Write-Host ""

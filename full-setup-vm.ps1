# VEXOR Full Setup - Execute NA VM via RDP (PowerShell Admin)
# Este script cria toda a estrutura e inicia os servicos

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VEXOR - Setup Completo" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Criar estrutura
Write-Host "`n[1/4] Criando estrutura..." -ForegroundColor Yellow
$dirs = @(
    "C:\vexor\packages\api\dist\routes",
    "C:\vexor\packages\api\dist\services",
    "C:\vexor\packages\api\dist\db",
    "C:\vexor\packages\web\dist",
    "C:\vexor\logs"
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
Write-Host "OK" -ForegroundColor Green

# Criar .env
Write-Host "`n[2/4] Criando .env..." -ForegroundColor Yellow
$env = @"
TWELVE_DATA_API_KEY=f908c32743af495fbd29ac1d946446de
SUPABASE_URL=https://tonwuegoyftfgfpkbvop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnd1ZWdveWZ0ZmdmcGtidm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0ODA4ODEsImV4cCI6MjA4ODA1Njg4MX0.tsholJQFV_pKFajDsGHLUYnOD959TJSvXxYvNxs7pc8
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnd1ZWdveWZ0ZmdmcGtidm9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ4MDg4MSwiZXhwIjoyMDg4MDU2ODgxfQ.9APp09YzrQoQNEVnhnfvNHgfM1dovMxP_ajEol0GzbA
DATABASE_URL=postgresql://postgres:G0Qg5TKjabVxnicn@db.tonwuegoyftfgfpkbvop.supabase.co:5432/postgres
OCI_GENAI_PRIMARY_KEY=sk-k0e35cOHls3M8Wa10pFdmtRqSmvGN6ntZFrl9O56Y4EeyBko
NODE_ENV=production
PORT=3000
"@
Set-Content -Path "C:\vexor\.env" -Value $env -Encoding UTF8
Write-Host "OK" -ForegroundColor Green

# Criar API simples
Write-Host "`n[3/4] Criando API..." -ForegroundColor Yellow
$app = @"
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import pg from 'pg';

const { Pool } = pg;
const app = Fastify({ logger: true });

await app.register(cors, { origin: '*' });
await app.register(helmet);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/api/v1/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/api/v1/social/feed', async () => {
  const result = await pool.query('SELECT * FROM social_posts ORDER BY created_at DESC LIMIT 20');
  return { posts: result.rows };
});

app.get('/api/v1/social/stories', async () => {
  return { stories: [] };
});

app.get('/api/v1/social/me', async () => {
  return { user: { id: 1, username: 'vexor_user', name: 'VEXOR User' } };
});

app.get('/', async (request, reply) => {
  reply.redirect('/social');
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await app.listen({ port, host: '0.0.0.0' });
    console.log('VEXOR API running on port ' + port);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
"@

# Criar package.json da API
$pkgApi = @"
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
    "pg": "^8.11.0"
  }
}
"@

Set-Content -Path "C:\vexor\packages\api\app.js" -Value $app -Encoding UTF8
Set-Content -Path "C:\vexor\packages\api\package.json" -Value $pkgApi -Encoding UTF8

# Instalar dependencias da API
cd C:\vexor\packages\api
npm install --silent 2>$null
Write-Host "OK" -ForegroundColor Green

# Criar PM2 config
Write-Host "`n[4/4] Iniciando servicos..." -ForegroundColor Yellow
$pm2 = @"
module.exports = {
  apps: [{
    name: 'vexor-api',
    cwd: 'C:/vexor/packages/api',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    env: { NODE_ENV: 'production', PORT: 3000 }
  }]
}
"@
Set-Content -Path "C:\vexor\ecosystem.config.js" -Value $pm2 -Encoding UTF8

cd C:\vexor
pm2 start ecosystem.config.js
pm2 save
Write-Host "OK" -ForegroundColor Green

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  VEXOR DEPLOYADO!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  API: http://132.226.166.206:3000" -ForegroundColor Yellow
Write-Host "  Health: http://132.226.166.206:3000/api/v1/health" -ForegroundColor Yellow
Write-Host ""

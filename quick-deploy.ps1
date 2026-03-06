# VEXOR Quick Deploy - COPIE E COLE INTEIRO NO POWERSHELL DA VM (como Admin)
# IP: 132.226.166.206 | Usuario: opc | Senha: L26112004Lf@

Write-Host "VEXOR Quick Deploy..." -ForegroundColor Cyan

# 1. Criar diretorios
New-Item -ItemType Directory -Force -Path "C:\vexor\packages\api" | Out-Null
New-Item -ItemType Directory -Force -Path "C:\vexor\packages\web\dist" | Out-Null

# 2. Criar .env
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
Set-Content -Path "C:\vexor\.env" -Value $env

# 3. Criar package.json
$pkg = '{"name":"vexor-api","version":"1.0.0","type":"module","main":"app.js","dependencies":{"fastify":"^4.26.0","@fastify/cors":"^9.0.0","@fastify/helmet":"^11.0.0","pg":"^8.11.0"}}'
Set-Content -Path "C:\vexor\packages\api\package.json" -Value $pkg

# 4. Criar API
$app = @'
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import pg from 'pg';

const { Pool } = pg;
const app = Fastify({ logger: true });

await app.register(cors, { origin: '*' });
await app.register(helmet);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/api/v1/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api/v1/social/feed', async () => {
  try { return { posts: (await pool.query('SELECT * FROM social_posts ORDER BY created_at DESC LIMIT 20')).rows }; }
  catch { return { posts: [] }; }
});
app.get('/api/v1/social/stories', async () => ({ stories: [] }));
app.get('/api/v1/social/me', async () => ({ user: { id: 1, username: 'vexor_user', name: 'VEXOR User' } }));

await app.listen({ port: parseInt(process.env.PORT || '3000'), host: '0.0.0.0' });
console.log('VEXOR API running on port 3000');
'@
Set-Content -Path "C:\vexor\packages\api\app.js" -Value $app

# 5. Instalar e iniciar
Set-Location C:\vexor\packages\api
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
npm install --silent 2>$null
pm2 start app.js --name vexor-api 2>$null
pm2 save 2>$null

Write-Host "`nPRONTO!" -ForegroundColor Green
Write-Host "API: http://132.226.166.206:3000" -ForegroundColor Cyan
Write-Host "Health: http://132.226.166.206:3000/api/v1/health" -ForegroundColor Cyan

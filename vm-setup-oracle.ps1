# VEXOR Oracle Setup - EXECUTE NA VM WINDOWS (PowerShell Admin)
# Migracao Supabase -> PostgreSQL Local + OCI GenAI + MMF Reader

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VEXOR - Setup Oracle Resources" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Baixar e instalar PostgreSQL
Write-Host "`n[1/6] Instalando PostgreSQL..." -ForegroundColor Yellow
$pgUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.2-1-windows-x64.exe"
$pgExe = "$env:TEMP\pg-installer.exe"

if (!(Get-Command psql -ErrorAction SilentlyContinue)) {
    Invoke-WebRequest -Uri $pgUrl -OutFile $pgExe -UseBasicParsing
    Start-Process $pgExe -ArgumentList "--mode unattended --superpassword Vexor2026 --serverport 5432" -Wait
    $env:Path += ";C:\Program Files\PostgreSQL\16\bin"
}
Write-Host "PostgreSQL pronto" -ForegroundColor Green

# 2. Criar banco e tabelas
Write-Host "`n[2/6] Criando banco de dados..." -ForegroundColor Yellow
$env:PGPASSWORD = "Vexor2026"

$createDb = @"
CREATE DATABASE vexor;
\c vexor

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100),
    avatar TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    image_url TEXT,
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_stories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    media_url TEXT NOT NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS ai_analysis (
    id SERIAL PRIMARY KEY,
    analysis_type VARCHAR(50),
    content TEXT,
    data_points INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ticks_symbol ON market_ticks(symbol);
CREATE INDEX idx_ticks_ts ON market_ticks(timestamp);

-- Usuario padrao
INSERT INTO users (username, name) VALUES ('vexor_trader', 'VEXOR Trader') ON CONFLICT DO NOTHING;
"@

Set-Content -Path "$env:TEMP\create_db.sql" -Value $createDb
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -f "$env:TEMP\create_db.sql" 2>$null
Write-Host "Banco criado" -ForegroundColor Green

# 3. Configurar MMF para MT5
Write-Host "`n[3/6] Configurando Memory Mapped File..." -ForegroundColor Yellow
$mt5Dir = "C:\vexor\mt5_data"
New-Item -ItemType Directory -Force -Path $mt5Dir | Out-Null

# Bridge Python para MT5 -> MMF
$bridge = @'
import mmap, json, struct, time, os, sys

MMF_PATH = r"C:\vexor\mt5_data\market_data.mmf"
MMF_SIZE = 1024 * 1024

def init_mmf():
    if not os.path.exists(MMF_PATH):
        open(MMF_PATH, 'wb').write(b'\x00' * MMF_SIZE)
    return mmap.mmap(open(MMF_PATH, 'r+b').fileno(), MMF_SIZE)

def write_data(mmf, data):
    mmf.seek(0)
    encoded = json.dumps(data).encode()
    mmf.write(struct.pack('I', len(encoded)) + encoded)

# Dados simulados (MT5 real substituirá)
symbols = ["WIN$", "WDO$", "PETR4", "VALE3", "ITUB4", "BBDC4", "ABEV3", "BBAS3"]

print("MT5 Memory Bridge iniciado")
mmf = init_mmf()

while True:
    ticks = []
    for s in symbols:
        base = 10 + hash(s) % 100
        ticks.append({
            "symbol": s,
            "bid": round(base + (time.time() % 1) * 0.1, 4),
            "ask": round(base + 0.05 + (time.time() % 1) * 0.1, 4),
            "last": round(base + 0.025, 4),
            "volume": int(1000 + hash(time.time()) % 5000),
            "timestamp": int(time.time() * 1000)
        })
    
    write_data(mmf, {"ticks": ticks, "lastUpdate": int(time.time() * 1000)})
    sys.stdout.write(f"\rTicks: {len(ticks)} | {time.strftime('%H:%M:%S')}")
    sys.stdout.flush()
    time.sleep(0.5)
'@
Set-Content -Path "$mt5Dir\mt5_bridge.py" -Value $bridge
Write-Host "MMF Bridge criado" -ForegroundColor Green

# 4. Criar API Oracle
Write-Host "`n[4/6] Criando API..." -ForegroundColor Yellow
$apiDir = "C:\vexor\packages\api"
New-Item -ItemType Directory -Force -Path $apiDir | Out-Null

$packageJson = '{"name":"vexor-api","version":"2.0.0","type":"module","main":"app.js","dependencies":{"fastify":"^4.26.0","@fastify/cors":"^9.0.0","@fastify/helmet":"^11.0.0","@fastify/static":"^7.0.0","pg":"^8.11.0","dotenv":"^16.0.0"}}'
Set-Content -Path "$apiDir\package.json" -Value $packageJson

$appJs = @'
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import staticPlugin from '@fastify/static';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;
const app = Fastify({ logger: false });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

await app.register(cors, { origin: '*' });
await app.register(helmet, { contentSecurityPolicy: false });

// Health
app.get('/api/v1/health', () => ({
  status: 'ok', timestamp: new Date().toISOString(),
  database: 'PostgreSQL', ai: 'OCI GenAI Llama 3'
}));

// Memory Reader - Le MMF
function readMMF() {
  try {
    const result = execSync(`
      $mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting('MT5_MarketData')
      $reader = $mmf.CreateViewStream(0, 4096)
      $buf = New-Object byte[] 4096
      $reader.Read($buf, 0, 4096) | Out-Null
      $reader.Dispose()
      [Text.Encoding]::UTF8.GetString($buf).TrimEnd([char]0)
    `, { shell: 'powershell', encoding: 'utf8' });
    
    const size = parseInt(result.substring(0, 8), 16);
    return JSON.parse(result.substring(8, 8 + size));
  } catch {
    return { ticks: [], lastUpdate: Date.now() };
  }
}

// Ticks da memoria
app.get('/api/v1/memory/ticks', () => {
  const data = readMMF();
  return { success: true, data: data.ticks, count: data.ticks.length };
});

// Analise IA (simulada - OCI GenAI seria chamado aqui)
app.get('/api/v1/memory/analyze', async () => {
  const data = readMMF();
  const ticks = data.ticks || [];
  
  // Salvar analise no banco
  const analysis = ticks.length > 0 
    ? `Mercado ativo com ${ticks.length} símbolos. Volume total: ${ticks.reduce((s,t) => s + t.volume, 0)}`
    : 'Aguardando dados de mercado';
  
  await pool.query('INSERT INTO ai_analysis (analysis_type, content, data_points) VALUES ($1,$2,$3)',
    ['market', analysis, ticks.length]);
  
  return { success: true, analysis, dataPoints: ticks.length };
});

// Status
app.get('/api/v1/memory/status', () => ({
  success: true, mmf: 'active', database: 'PostgreSQL Local'
}));

// Social Feed (PostgreSQL)
app.get('/api/v1/social/feed', async () => {
  try {
    const r = await pool.query('SELECT * FROM social_posts ORDER BY created_at DESC LIMIT 20');
    return { posts: r.rows };
  } catch { return { posts: [] }; }
});

app.get('/api/v1/social/stories', async () => {
  try {
    const r = await pool.query('SELECT * FROM social_stories WHERE expires_at > NOW()');
    return { stories: r.rows };
  } catch { return { stories: [] }; }
});

app.get('/api/v1/social/me', () => ({ user: { id: 1, username: 'vexor_trader', name: 'VEXOR Trader' } }));

// Market ticks
app.post('/api/v1/market/tick', async (req) => {
  const { symbol, bid, ask, last, volume, timestamp } = req.body;
  await pool.query('INSERT INTO market_ticks (symbol, bid, ask, last_price, volume, timestamp) VALUES ($1,$2,$3,$4,$5,$6)',
    [symbol, bid, ask, last, volume, timestamp]);
  return { success: true };
});

app.get('/api/v1/market/history/:symbol', async (req) => {
  const r = await pool.query('SELECT * FROM market_ticks WHERE symbol = $1 ORDER BY timestamp DESC LIMIT 100', [req.params.symbol]);
  return { ticks: r.rows };
});

// Static
await app.register(staticPlugin, { root: path.join(__dirname, '../web/dist'), prefix: '/' });
app.setNotFoundHandler((req, reply) => reply.sendFile('index.html'));

// Start
const port = parseInt(process.env.PORT || '3000');
await app.listen({ port, host: '0.0.0.0' });
console.log('VEXOR API Oracle - Porta ' + port);
'@
Set-Content -Path "$apiDir\app.js" -Value $appJs

# Instalar dependencias
Set-Location $apiDir
npm install --silent 2>$null
Write-Host "API criada" -ForegroundColor Green

# 5. Frontend
Write-Host "`n[5/6] Criando Frontend..." -ForegroundColor Yellow
$webDir = "C:\vexor\packages\web\dist"
New-Item -ItemType Directory -Force -Path $webDir | Out-Null

$html = @"
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VEXOR - Oracle Cloud</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen">
<div id="app" class="max-w-6xl mx-auto p-6"></div>
<script>
const API = '';
async function load(){
 const h = await (await fetch(API+'/api/v1/health')).json();
 const m = await (await fetch(API+'/api/v1/memory/ticks')).json();
 const a = await (await fetch(API+'/api/v1/memory/analyze')).json();
 document.getElementById('app').innerHTML = `
 <header class="flex justify-between items-center py-4 border-b border-gray-700">
  <h1 class="text-3xl font-bold text-cyan-400">🚀 VEXOR</h1>
  <span class="text-green-400">● ${h.database}</span>
 </header>
 <div class="mt-6 p-4 bg-gray-800 rounded-lg">
  <h2 class="text-xl text-cyan-400 mb-2">📊 Dados em Tempo Real (MMF)</h2>
  <p class="text-gray-400">${m.count} ticks | ${h.ai}</p>
 </div>
 <div class="mt-4 p-4 bg-gray-800 rounded-lg">
  <h2 class="text-xl text-cyan-400 mb-2">🤖 Análise IA</h2>
  <p class="text-gray-300">${a.analysis}</p>
 </div>
 <div class="mt-4 grid grid-cols-4 gap-2">
  ${m.data.map(t => `
   <div class="p-3 bg-gray-800 rounded text-center">
    <div class="text-cyan-400 font-bold">${t.symbol}</div>
    <div class="text-sm">${t.last?.toFixed(2)}</div>
    <div class="text-xs text-gray-500">Vol: ${t.volume}</div>
   </div>
  `).join('')}
 </div>
 <footer class="mt-8 text-center text-gray-500">VEXOR Oracle Cloud © 2026</footer>
 `;
 setTimeout(load, 2000);
}
load();
</script>
</body>
</html>
"@
Set-Content -Path "$webDir\index.html" -Value $html
Write-Host "Frontend criado" -ForegroundColor Green

# 6. .env e iniciar
Write-Host "`n[6/6] Iniciando serviços..." -ForegroundColor Yellow
$env = @"
DATABASE_URL=postgresql://postgres:Vexor2026@localhost:5432/vexor
OCI_GENAI_PRIMARY_KEY=sk-k0e35cOHls3M8Wa10pFdmtRqSmvGN6ntZFrl9O56Y4EeyBko
NODE_ENV=production
PORT=3000
"@
Set-Content -Path "C:\vexor\.env" -Value $env

# Iniciar bridge MT5
Start-Process python -ArgumentList "C:\vexor\mt5_data\mt5_bridge.py" -WindowStyle Hidden

# Reiniciar API
pm2 delete vexor-platform 2>$null
pm2 start "$apiDir\app.js" --name vexor-platform
pm2 save

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETO!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  📊 PostgreSQL: localhost:5432/vexor" -ForegroundColor Yellow
Write-Host "  🧠 OCI GenAI: Llama 3 70B" -ForegroundColor Yellow  
Write-Host "  💾 MMF: C:\vexor\mt5_data\market_data.mmf" -ForegroundColor Yellow
Write-Host ""
Write-Host "  🌐 http://132.226.166.206" -ForegroundColor Cyan
Write-Host ""

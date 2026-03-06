// VEXOR API - Oracle Cloud Integration
// PostgreSQL + OCI GenAI + Memory Mapped File Reader

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import staticPlugin from '@fastify/static';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readMemoryMappedFile, analyzeWithGenAI, startMemoryReader } from './services/memory-reader.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;
const app = Fastify({ logger: true });

// PostgreSQL Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Vexor2026@localhost:5432/vexor',
  // SSL desabilitado para PostgreSQL local
});

// Plugins
app.register(cors, { origin: '*' });
app.register(helmet, { contentSecurityPolicy: false });

// ==================== HEALTH ====================
app.get('/api/v1/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '2.0.0',
  server: 'VEXOR Oracle Cloud',
  database: 'PostgreSQL',
  ai: 'OCI GenAI Llama 3 70B'
}));

// ==================== MEMORY ROUTES ====================

// Lê dados em tempo real da memória MMF
app.get('/api/v1/memory/ticks', async () => {
  const ticks = await readMemoryMappedFile();
  return {
    success: true,
    data: ticks,
    count: ticks.length,
    timestamp: new Date().toISOString()
  };
});

// Análise de mercado com OCI GenAI
app.get('/api/v1/memory/analyze', async () => {
  const ticks = await readMemoryMappedFile();
  const analysis = await analyzeWithGenAI(ticks);
  return {
    success: true,
    analysis,
    dataPoints: ticks.length,
    timestamp: new Date().toISOString()
  };
});

// Status do sistema
app.get('/api/v1/memory/status', async () => ({
  success: true,
  status: 'active',
  platform: process.platform,
  mmfPath: process.env.MMF_PATH || 'C:\\vexor\\mt5_data\\market_data.mmf',
  database: 'PostgreSQL Local',
  aiModel: 'Llama 3 70B'
}));

// Resumo por símbolo
app.get('/api/v1/memory/summary', async () => {
  const ticks = await readMemoryMappedFile();
  const summary = ticks.reduce((acc, tick) => {
    if (!acc[tick.symbol]) {
      acc[tick.symbol] = {
        symbol: tick.symbol,
        bid: tick.bid,
        ask: tick.ask,
        last: tick.last,
        volume: tick.volume,
        spread: tick.ask - tick.bid
      };
    } else {
      acc[tick.symbol].volume += tick.volume;
    }
    return acc;
  }, {} as Record<string, any>);
  
  return { success: true, summary: Object.values(summary) };
});

// ==================== SOCIAL ROUTES (PostgreSQL) ====================

app.get('/api/v1/social/feed', async () => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.username, u.name as user_name, u.avatar as user_avatar
      FROM social_posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 20
    `);
    return { posts: result.rows };
  } catch {
    return { posts: [] };
  }
});

app.get('/api/v1/social/stories', async () => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.username, u.name as user_name
      FROM social_stories s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.expires_at > NOW()
      ORDER BY s.created_at DESC
    `);
    return { stories: result.rows };
  } catch {
    return { stories: [] };
  }
});

app.get('/api/v1/social/me', async () => ({
  user: {
    id: 1,
    username: 'vexor_user',
    name: 'VEXOR Trader',
    avatar: null
  }
}));

// ==================== MARKET DATA ROUTES ====================

// Salvar tick no banco
app.post('/api/v1/market/tick', async (request) => {
  const { symbol, bid, ask, last, volume, timestamp } = request.body as any;
  
  try {
    await pool.query(`
      INSERT INTO market_ticks (symbol, bid, ask, last_price, volume, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [symbol, bid, ask, last, volume, timestamp]);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Erro ao salvar tick' };
  }
});

// Histórico de ticks
app.get('/api/v1/market/history/:symbol', async (request) => {
  const { symbol } = request.params as any;
  
  try {
    const result = await pool.query(`
      SELECT * FROM market_ticks
      WHERE symbol = $1
      ORDER BY timestamp DESC
      LIMIT 100
    `, [symbol]);
    
    return { ticks: result.rows };
  } catch {
    return { ticks: [] };
  }
});

// ==================== AI ANALYSIS ROUTES ====================

// Salvar análise
app.post('/api/v1/ai/analysis', async (request) => {
  const { type, content, dataPoints } = request.body as any;
  
  try {
    const result = await pool.query(`
      INSERT INTO ai_analysis (analysis_type, content, data_points)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [type, content, dataPoints]);
    
    return { success: true, id: result.rows[0].id };
  } catch {
    return { success: false };
  }
});

// Histórico de análises
app.get('/api/v1/ai/history', async () => {
  try {
    const result = await pool.query(`
      SELECT * FROM ai_analysis
      ORDER BY created_at DESC
      LIMIT 10
    `);
    return { analyses: result.rows };
  } catch {
    return { analyses: [] };
  }
});

// ==================== STATIC FILES ====================

await app.register(staticPlugin, {
  root: path.join(__dirname, '../web/dist'),
  prefix: '/'
});

app.setNotFoundHandler(async (request, reply) => {
  reply.sendFile('index.html');
});

// ==================== START ====================

const start = async () => {
  try {
    // Inicia leitor de memória em background
    startMemoryReader(1000);
    console.log('🔍 Memory Reader iniciado');
    
    const port = parseInt(process.env.PORT || '3000');
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 VEXOR API rodando na porta ${port}`);
    console.log('📊 PostgreSQL conectado');
    console.log('🤖 OCI GenAI pronto');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

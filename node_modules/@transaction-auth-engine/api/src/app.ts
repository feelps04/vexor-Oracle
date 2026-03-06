import Fastify from 'fastify';
import Redis from 'ioredis';
import { Pool } from 'pg';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import dns from 'node:dns';
import { config } from 'dotenv';
config({ path: path.resolve(process.cwd(), '.env') }); // Load .env from project root
import { createLogger } from '@transaction-auth-engine/shared';
import { ApiKafkaProducer } from './infrastructure/kafka-producer.js';
import { registerSwagger } from './plugins/swagger.js';
import { transactionRoutes } from './routes/transactions.js';
import { orderRoutes } from './routes/orders.js';
import { healthRoutes } from './routes/health.js';
import { integrityRoutes } from './routes/integrity.js';
import { balanceAtRoutes } from './routes/balance-at.js';
import { balanceOpsRoutes } from './routes/balance-ops.js';
import { authRoutes } from './routes/auth.js';
import { chatRoutes } from './routes/chat.js';
import { newsRoutes } from './routes/news.js';
import { realtimeRoutes } from './routes/realtime.js';
import { stockRoutes } from './routes/stocks.js';
import { stocksWsRoutes } from './routes/stocks-ws.js';
import { btcWsRoutes } from './routes/btc-ws.js';
import { fxRoutes } from './routes/fx.js';
import { teamsRoutes } from './routes/teams.js';
import { marketGroupsRoutes } from './routes/market-groups.js';
import { sectorRoutes } from './routes/sectors.js';
import socialRoutes from './routes/social.js';
import { MercadoBitcoinClient, BrapiClient } from '@transaction-auth-engine/shared';
import { registerMetrics, httpRequestsTotal, httpRequestDuration } from './infrastructure/metrics.js';
import { runMigrations } from './infrastructure/migrations.js';

if (!process.env.KAFKAJS_NO_PARTITIONER_WARNING) {
  process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';
}

dns.setDefaultResultOrder('ipv4first');

const PORT = Number(process.env.PORT ?? 3000);
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL;

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function ensurePgReady(pg: Pool, logger: ReturnType<typeof createLogger>): Promise<boolean> {
  const maxAttempts = Number(process.env.PG_STARTUP_ATTEMPTS ?? 10);
  const backoffMs = Number(process.env.PG_STARTUP_BACKOFF_MS ?? 1000);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pg.query('SELECT 1');
      return true;
    } catch (err) {
      if (attempt === maxAttempts) {
        logger.warn({ err }, 'Postgres unavailable; running API in degraded mode (no Postgres)');
        return false;
      }
      await sleep(backoffMs);
    }
  }
  return false;
}

async function ensureKafkaReady(producer: ApiKafkaProducer, logger: ReturnType<typeof createLogger>): Promise<boolean> {
  const maxAttempts = Number(process.env.KAFKA_STARTUP_ATTEMPTS ?? 30);
  const backoffMs = Number(process.env.KAFKA_STARTUP_BACKOFF_MS ?? 1000);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await producer.connect();
    if (producer.isEnabled()) return true;
    if (attempt === maxAttempts) {
      logger.warn({ brokers: KAFKA_BROKERS }, 'Kafka unavailable; running API in degraded mode (no Kafka produce)');
      return false;
    }
    await sleep(backoffMs);
  }
  return false;
}

export async function buildApp(): Promise<FastifyInstance> {
  const logger = createLogger('api');
  const app = Fastify({ logger: false });

  // CORS support
  await app.register(import('@fastify/cors'), {
    origin: ['http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  });

  // Request timing and metrics hook
  app.addHook('onRequest', (request, _reply, done) => {
    (request as unknown as { log: typeof logger; startTime: number }).log = logger.child({
      requestId: request.id,
      method: request.method,
      url: request.url,
    });
    (request as unknown as { startTime: number }).startTime = Date.now();
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    const startTime = (request as unknown as { startTime?: number }).startTime;
    const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
    const route = request.routerPath || request.url;
    
    httpRequestsTotal.inc({
      method: request.method,
      route: route,
      status: reply.statusCode.toString(),
    });
    
    httpRequestDuration.observe(
      { method: request.method, route: route },
      duration
    );
    
    done();
  });

  await registerSwagger(app);
  await app.register(fastifyWebsocket);
  await registerMetrics(app);

  const fs = await import('fs');
  const webDistLocal = path.join(process.cwd(), 'dist');
  const webDistMonorepo = path.join(process.cwd(), 'packages', 'web', 'dist');
  const publicLocal = path.join(process.cwd(), 'public');
  const publicMonorepo = path.join(process.cwd(), 'packages', 'api', 'public');

  const resolvedPublic =
    fs.existsSync(webDistLocal) ? webDistLocal : fs.existsSync(webDistMonorepo) ? webDistMonorepo : fs.existsSync(publicLocal) ? publicLocal : publicMonorepo;

  if (fs.existsSync(resolvedPublic)) {
    const nodeMajor = Number(String(process.versions.node || '0').split('.')[0] || 0);
    if (nodeMajor >= 22) {
      logger.warn({ node: process.versions.node }, '@fastify/static disabled on Node >=22; running API without static assets');
    } else {
    try {
      const fastifyStatic = (await import('@fastify/static')).default;
      await app.register(fastifyStatic, {
        root: resolvedPublic,
        prefix: '/',
        setHeaders: (res, pathname) => {
          const normalized = String(pathname || '').replace(/\\/g, '/');
          if (normalized.endsWith('/app.js') || normalized.endsWith('/index.html') || normalized === 'app.js' || normalized === 'index.html') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
          }
        },
      });
      app.get('/', (_req, reply) => reply.sendFile('index.html'));

      app.get('/login', (_req, reply) => reply.sendFile('index.html'));
      app.get('/register', (_req, reply) => reply.sendFile('index.html'));
      app.get('/app', (_req, reply) => reply.sendFile('index.html'));
      app.get('/app/*', (_req, reply) => reply.sendFile('index.html'));
    } catch (err) {
      logger.warn({ err }, '@fastify/static unavailable; running API without static assets');
    }
    }
  }

  const producer = new ApiKafkaProducer({ brokers: KAFKA_BROKERS });
  await ensureKafkaReady(producer, logger);

  const mercadoBitcoin = new MercadoBitcoinClient();
  const brapi = new BrapiClient({ token: process.env.BRAPI_TOKEN });

  let redis: Redis | undefined;
  try {
    redis = new Redis(REDIS_URL);
    try {
      redis.on('error', () => {
        // avoid noisy unhandled error events; routes already handle redis failures
      });
    } catch {
      // ignore
    }

    const pingTimeoutMs = Number(process.env.REDIS_PING_TIMEOUT_MS ?? 1500);
    const pingOk = await Promise.race([
      redis.ping().then(() => true).catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), pingTimeoutMs)),
    ]);
    if (!pingOk) {
      try {
        redis.disconnect();
      } catch {
        // ignore
      }
      redis = undefined;
    }
  } catch {
    redis = undefined;
  }

  let pg: Pool | undefined;
  if (DATABASE_URL) {
    pg = new Pool({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 5000),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30000),
      max: Number(process.env.PG_POOL_MAX ?? 10),
      ssl: { rejectUnauthorized: false }, // Required for Supabase
    });

    const ok = await ensurePgReady(pg, logger);
    if (!ok) {
      try {
        await pg.end();
      } catch {
        // ignore
      }
      pg = undefined;
    }
  }

  await app.register(fastifyCookie);
  const jwtSecret = process.env.JWT_SECRET;
  // JWT_SECRET is optional - we support Supabase JWT (ES256) without it
  if (jwtSecret) {
    await app.register(fastifyJwt, { secret: jwtSecret });
  }

  if (pg) await runMigrations(pg);

  await app.register(marketGroupsRoutes);
  await app.register(sectorRoutes, { redis });
  await app.register(socialRoutes, { pg });

  await app.register(transactionRoutes, { producer, redis });
  await app.register(orderRoutes, { producer, redis, mercadoBitcoin, brapi });
  await app.register(fxRoutes, { redis });
  await app.register(stockRoutes, { redis });
  await app.register(stocksWsRoutes, { brokers: KAFKA_BROKERS.join(','), redis });
  if (redis) {
    await app.register(teamsRoutes, { redis });
  }
  await app.register(btcWsRoutes, {
    brokers: KAFKA_BROKERS,
    mercadoBitcoin: mercadoBitcoin as unknown as {
      getBtcBrlCandles(params: {
        fromSec: number;
        toSec: number;
        resolution: string;
      }): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>>;
    },
  });
  await app.register(healthRoutes, { redis: redis ? { ping: () => redis!.ping() } : undefined });
  if (redis && pg) {
    await app.register(integrityRoutes, { redis, pg });
    await app.register(realtimeRoutes, { redis, pg });
  }
  // Register auth routes with or without pg (supports Supabase JWT and mock login)
  await app.register(authRoutes, { pg, redis });
  if (pg) {
    await app.register(chatRoutes, { pg });
    await app.register(newsRoutes, { pg });
    await app.register(balanceAtRoutes, { pg });
  }
  if (redis) {
    await app.register(balanceOpsRoutes, { redis, pg });
  }

  app.addHook('onClose', async () => {
    await producer.disconnect();
    if (redis) redis.disconnect();
    if (pg) await pg.end();
  });

  return app;
}

async function main(): Promise<void> {
  const app = await buildApp();
  const logger = createLogger('api');

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info({ port: PORT }, 'API listening');
  } catch (err) {
    logger.error({ err }, 'Failed to start');
    process.exit(1);
  }
}

main();

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const ioredis_1 = __importDefault(require("ioredis"));
const pg_1 = require("pg");
const path_1 = __importDefault(require("path"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const node_dns_1 = __importDefault(require("node:dns"));
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)({ path: path_1.default.resolve(process.cwd(), '.env') }); // Load .env from project root
const shared_1 = require("@transaction-auth-engine/shared");
const kafka_producer_js_1 = require("./infrastructure/kafka-producer.js");
const swagger_js_1 = require("./plugins/swagger.js");
const transactions_js_1 = require("./routes/transactions.js");
const orders_js_1 = require("./routes/orders.js");
const health_js_1 = require("./routes/health.js");
const integrity_js_1 = require("./routes/integrity.js");
const balance_at_js_1 = require("./routes/balance-at.js");
const balance_ops_js_1 = require("./routes/balance-ops.js");
const auth_js_1 = require("./routes/auth.js");
const chat_js_1 = require("./routes/chat.js");
const news_js_1 = require("./routes/news.js");
const realtime_js_1 = require("./routes/realtime.js");
const stocks_js_1 = require("./routes/stocks.js");
const stocks_ws_js_1 = require("./routes/stocks-ws.js");
const btc_ws_js_1 = require("./routes/btc-ws.js");
const fx_js_1 = require("./routes/fx.js");
const teams_js_1 = require("./routes/teams.js");
const market_groups_js_1 = require("./routes/market-groups.js");
const sectors_js_1 = require("./routes/sectors.js");
const social_js_1 = __importDefault(require("./routes/social.js"));
const shared_2 = require("@transaction-auth-engine/shared");
const metrics_js_1 = require("./infrastructure/metrics.js");
const migrations_js_1 = require("./infrastructure/migrations.js");
if (!process.env.KAFKAJS_NO_PARTITIONER_WARNING) {
    process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';
}
node_dns_1.default.setDefaultResultOrder('ipv4first');
const PORT = Number(process.env.PORT ?? 3000);
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL;
async function sleep(ms) {
    await new Promise((r) => setTimeout(r, ms));
}
async function ensurePgReady(pg, logger) {
    const maxAttempts = Number(process.env.PG_STARTUP_ATTEMPTS ?? 10);
    const backoffMs = Number(process.env.PG_STARTUP_BACKOFF_MS ?? 1000);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await pg.query('SELECT 1');
            return true;
        }
        catch (err) {
            if (attempt === maxAttempts) {
                logger.warn({ err }, 'Postgres unavailable; running API in degraded mode (no Postgres)');
                return false;
            }
            await sleep(backoffMs);
        }
    }
    return false;
}
async function ensureKafkaReady(producer, logger) {
    const maxAttempts = Number(process.env.KAFKA_STARTUP_ATTEMPTS ?? 30);
    const backoffMs = Number(process.env.KAFKA_STARTUP_BACKOFF_MS ?? 1000);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await producer.connect();
        if (producer.isEnabled())
            return true;
        if (attempt === maxAttempts) {
            logger.warn({ brokers: KAFKA_BROKERS }, 'Kafka unavailable; running API in degraded mode (no Kafka produce)');
            return false;
        }
        await sleep(backoffMs);
    }
    return false;
}
async function buildApp() {
    const logger = (0, shared_1.createLogger)('api');
    const app = (0, fastify_1.default)({ logger: false });
    // CORS support
    await app.register(import('@fastify/cors'), {
        origin: ['http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:3000', 'http://127.0.0.1:3000'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    });
    // Request timing and metrics hook
    app.addHook('onRequest', (request, _reply, done) => {
        request.log = logger.child({
            requestId: request.id,
            method: request.method,
            url: request.url,
        });
        request.startTime = Date.now();
        done();
    });
    app.addHook('onResponse', (request, reply, done) => {
        const startTime = request.startTime;
        const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
        const route = request.routerPath || request.url;
        metrics_js_1.httpRequestsTotal.inc({
            method: request.method,
            route: route,
            status: reply.statusCode.toString(),
        });
        metrics_js_1.httpRequestDuration.observe({ method: request.method, route: route }, duration);
        done();
    });
    await (0, swagger_js_1.registerSwagger)(app);
    await app.register(websocket_1.default);
    await (0, metrics_js_1.registerMetrics)(app);
    const fs = await import('fs');
    const webDistLocal = path_1.default.join(process.cwd(), 'dist');
    const webDistMonorepo = path_1.default.join(process.cwd(), 'packages', 'web', 'dist');
    const publicLocal = path_1.default.join(process.cwd(), 'public');
    const publicMonorepo = path_1.default.join(process.cwd(), 'packages', 'api', 'public');
    const resolvedPublic = fs.existsSync(webDistLocal) ? webDistLocal : fs.existsSync(webDistMonorepo) ? webDistMonorepo : fs.existsSync(publicLocal) ? publicLocal : publicMonorepo;
    if (fs.existsSync(resolvedPublic)) {
        const nodeMajor = Number(String(process.versions.node || '0').split('.')[0] || 0);
        if (nodeMajor >= 22) {
            logger.warn({ node: process.versions.node }, '@fastify/static disabled on Node >=22; running API without static assets');
        }
        else {
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
            }
            catch (err) {
                logger.warn({ err }, '@fastify/static unavailable; running API without static assets');
            }
        }
    }
    const producer = new kafka_producer_js_1.ApiKafkaProducer({ brokers: KAFKA_BROKERS });
    await ensureKafkaReady(producer, logger);
    const mercadoBitcoin = new shared_2.MercadoBitcoinClient();
    const brapi = new shared_2.BrapiClient({ token: process.env.BRAPI_TOKEN });
    let redis;
    try {
        redis = new ioredis_1.default(REDIS_URL);
        try {
            redis.on('error', () => {
                // avoid noisy unhandled error events; routes already handle redis failures
            });
        }
        catch {
            // ignore
        }
        const pingTimeoutMs = Number(process.env.REDIS_PING_TIMEOUT_MS ?? 1500);
        const pingOk = await Promise.race([
            redis.ping().then(() => true).catch(() => false),
            new Promise((resolve) => setTimeout(() => resolve(false), pingTimeoutMs)),
        ]);
        if (!pingOk) {
            try {
                redis.disconnect();
            }
            catch {
                // ignore
            }
            redis = undefined;
        }
    }
    catch {
        redis = undefined;
    }
    let pg;
    if (DATABASE_URL) {
        pg = new pg_1.Pool({
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
            }
            catch {
                // ignore
            }
            pg = undefined;
        }
    }
    await app.register(cookie_1.default);
    const jwtSecret = process.env.JWT_SECRET;
    // JWT_SECRET is optional - we support Supabase JWT (ES256) without it
    if (jwtSecret) {
        await app.register(jwt_1.default, { secret: jwtSecret });
    }
    if (pg)
        await (0, migrations_js_1.runMigrations)(pg);
    await app.register(market_groups_js_1.marketGroupsRoutes);
    await app.register(sectors_js_1.sectorRoutes, { redis });
    await app.register(social_js_1.default, { pg });
    await app.register(transactions_js_1.transactionRoutes, { producer, redis });
    await app.register(orders_js_1.orderRoutes, { producer, redis, mercadoBitcoin, brapi });
    await app.register(fx_js_1.fxRoutes, { redis });
    await app.register(stocks_js_1.stockRoutes, { redis });
    await app.register(stocks_ws_js_1.stocksWsRoutes, { brokers: KAFKA_BROKERS.join(','), redis });
    if (redis) {
        await app.register(teams_js_1.teamsRoutes, { redis });
    }
    await app.register(btc_ws_js_1.btcWsRoutes, {
        brokers: KAFKA_BROKERS,
        mercadoBitcoin: mercadoBitcoin,
    });
    await app.register(health_js_1.healthRoutes, { redis: redis ? { ping: () => redis.ping() } : undefined });
    if (redis && pg) {
        await app.register(integrity_js_1.integrityRoutes, { redis, pg });
        await app.register(realtime_js_1.realtimeRoutes, { redis, pg });
    }
    // Register auth routes with or without pg (supports Supabase JWT and mock login)
    await app.register(auth_js_1.authRoutes, { pg, redis });
    if (pg) {
        await app.register(chat_js_1.chatRoutes, { pg });
        await app.register(news_js_1.newsRoutes, { pg });
        await app.register(balance_at_js_1.balanceAtRoutes, { pg });
    }
    if (redis) {
        await app.register(balance_ops_js_1.balanceOpsRoutes, { redis, pg });
    }
    app.addHook('onClose', async () => {
        await producer.disconnect();
        if (redis)
            redis.disconnect();
        if (pg)
            await pg.end();
    });
    return app;
}
async function main() {
    const app = await buildApp();
    const logger = (0, shared_1.createLogger)('api');
    try {
        await app.listen({ port: PORT, host: '0.0.0.0' });
        logger.info({ port: PORT }, 'API listening');
    }
    catch (err) {
        logger.error({ err }, 'Failed to start');
        process.exit(1);
    }
}
main();

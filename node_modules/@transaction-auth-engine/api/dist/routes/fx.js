"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fxRoutes = fxRoutes;
const shared_1 = require("@transaction-auth-engine/shared");
const kafkajs_1 = require("kafkajs");
const node_dns_1 = __importDefault(require("node:dns"));
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const TOPIC_FX = 'fx.ticker';
const AWESOME_LAST_URL = 'https://economia.awesomeapi.com.br/last/';
const AWESOME_DAILY_URL = 'https://economia.awesomeapi.com.br/json/daily/';
async function resolveIpv4Host(hostname, timeoutMs = 1000) {
    const host = String(hostname || '').trim();
    if (!host)
        return host;
    const lookupPromise = new Promise((resolve, reject) => {
        node_dns_1.default.lookup(host, { family: 4 }, (err, address) => {
            if (err || !address)
                return reject(err ?? new Error('dns lookup failed'));
            resolve(address);
        });
    });
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(host), timeoutMs);
    });
    try {
        return await Promise.race([lookupPromise, timeoutPromise]);
    }
    catch {
        return host;
    }
}
async function httpGetJson(url) {
    const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    }
    catch {
        json = null;
    }
    return { status: res.status, json, text };
}
function isYahooInterval(v) {
    return ['1m', '2m', '5m', '15m', '30m', '60m', '1h', '1d'].includes(v);
}
function isCurrency(v) {
    return v === 'USD' || v === 'EUR';
}
function rangeDays(range) {
    if (range === '5d')
        return 5;
    if (range === '7d')
        return 7;
    if (range === '1mo')
        return 30;
    if (range === '3mo')
        return 90;
    if (range === '6mo')
        return 180;
    if (range === '1y')
        return 365;
    if (range === '2y')
        return 730;
    if (range === '5y')
        return 1825;
    return 7;
}
async function fetchFxDaily(currency, days) {
    const pair = `${currency}-BRL`;
    const url = `${AWESOME_DAILY_URL}${pair}/${days}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`FX daily fetch failed: ${res.status}`);
    }
    const json = (await res.json());
    return Array.isArray(json) ? json : [];
}
async function fetchFxRate(currency) {
    const url = `${AWESOME_LAST_URL}${currency}-BRL`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`FX rate fetch failed: ${res.status}`);
    }
    const json = (await res.json());
    const key = `${currency}BRL`;
    const bid = json?.[key]?.bid;
    const rate = parseFloat(String(bid));
    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('FX rate fetch failed: invalid bid');
    }
    return rate;
}
function buildDailyCandles(items) {
    // AwesomeAPI returns most recent first
    const sorted = items
        .map((it) => {
        const ts = parseInt(String(it.timestamp ?? ''), 10);
        const close = parseFloat(String(it.bid ?? ''));
        const highRaw = parseFloat(String(it.high ?? ''));
        const lowRaw = parseFloat(String(it.low ?? ''));
        const high = Number.isFinite(highRaw) ? highRaw : close;
        const low = Number.isFinite(lowRaw) ? lowRaw : close;
        return { ts, high, low, close };
    })
        .filter((x) => Number.isFinite(x.ts) && Number.isFinite(x.close))
        .sort((a, b) => a.ts - b.ts);
    const out = [];
    for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i];
        const prevClose = i > 0 ? sorted[i - 1].close : cur.close;
        const dayStartSec = Math.floor(cur.ts / 86400) * 86400;
        out.push({ time: dayStartSec, open: prevClose, high: cur.high, low: cur.low, close: cur.close });
    }
    return out;
}
async function fxRoutes(app, opts) {
    const yahoo = new shared_1.YahooFinanceClient();
    const marketDataUrl = String(process.env.MARKET_DATA_URL ?? '').trim();
    const redis = opts?.redis;
    const FX_LAST_RATE_KEY_PREFIX = 'market:fx:lastRate:v1:';
    const subsByCurrency = new Map();
    const timers = new Map();
    const ticksByCurrency = new Map();
    const MAX_TICKS = 120_000;
    // Kafka consumer for real-time ticks
    const kafka = new kafkajs_1.Kafka({
        clientId: 'api-fx-bridge',
        brokers: KAFKA_BROKERS,
        retry: { retries: 0 },
        logLevel: kafkajs_1.logLevel.NOTHING,
    });
    const consumer = kafka.consumer({ groupId: 'api-fx-bridge' });
    let stopping = false;
    let started = false;
    const startConsumer = async () => {
        if (started || stopping)
            return;
        started = true;
        try {
            await consumer.connect();
            await consumer.subscribe({ topic: TOPIC_FX, fromBeginning: false });
            void consumer.run({
                eachMessage: async ({ message }) => {
                    const value = message.value?.toString();
                    if (!value)
                        return;
                    let tick;
                    try {
                        tick = JSON.parse(value);
                    }
                    catch {
                        return;
                    }
                    if (tick.type !== 'tick')
                        return;
                    const currency = String(tick.currency ?? '').toUpperCase();
                    if (!currency || (currency !== 'USD' && currency !== 'EUR'))
                        return;
                    const rate = Number(tick.rate);
                    if (!Number.isFinite(rate) || rate <= 0)
                        return;
                    // Atualiza ticks em memória
                    const ts = Number(tick.ts) || Math.floor(Date.now() / 1000);
                    const ticks = ticksByCurrency.get(currency) ?? [];
                    ticks.push({ ts: ts * 1000, rate });
                    if (ticks.length > MAX_TICKS) {
                        ticks.splice(0, ticks.length - MAX_TICKS);
                    }
                    ticksByCurrency.set(currency, ticks);
                    if (redis) {
                        try {
                            await redis.set(`${FX_LAST_RATE_KEY_PREFIX}${currency}`, JSON.stringify({ rate, ts: ts * 1000 }));
                        }
                        catch {
                            // ignore
                        }
                    }
                    // Broadcast via WebSocket
                    const payload = JSON.stringify({
                        type: 'tick',
                        pair: `${currency}BRL`,
                        currency,
                        rate,
                        ts: ts * 1000,
                        open: tick.open ?? rate,
                        high: tick.high ?? rate,
                        low: tick.low ?? rate,
                        close: tick.close ?? rate,
                    });
                    const subs = subsByCurrency.get(currency);
                    if (!subs || subs.size === 0)
                        return;
                    for (const ws of subs) {
                        try {
                            ws.send(payload);
                        }
                        catch {
                            // ignore
                        }
                    }
                },
            });
        }
        catch {
            try {
                await consumer.disconnect();
            }
            catch {
                // ignore
            }
        }
    };
    void startConsumer();
    const ensurePolling = (currency) => {
        if (timers.has(currency))
            return;
        const timer = setInterval(async () => {
            try {
                const pair = `${currency}BRL=X`;
                const rate = await yahoo.getFxRate(pair);
                const ts = Date.now();
                const ticks = ticksByCurrency.get(currency) ?? [];
                ticks.push({ ts, rate });
                if (ticks.length > MAX_TICKS) {
                    ticks.splice(0, ticks.length - MAX_TICKS);
                }
                ticksByCurrency.set(currency, ticks);
                const payload = JSON.stringify({ type: 'tick', pair: `${currency}BRL`, currency, rate, ts });
                const subs = subsByCurrency.get(currency);
                if (!subs)
                    return;
                for (const ws of subs) {
                    try {
                        ws.send(payload);
                    }
                    catch {
                        // ignore
                    }
                }
            }
            catch {
                // ignore
            }
        }, 1000);
        timers.set(currency, timer);
    };
    app.get('/api/v1/fx/history', async (req, reply) => {
        const q = (req.query ?? {});
        const currencyRaw = String(q.currency ?? 'USD').toUpperCase();
        const currency = isCurrency(currencyRaw) ? currencyRaw : 'USD';
        const range = (q.range ?? '7d');
        const intervalParam = String(q.interval ?? '1d');
        const interval = isYahooInterval(intervalParam) ? intervalParam : '1d';
        if (!marketDataUrl)
            return reply.status(503).send({ message: 'fx history unavailable: MARKET_DATA_URL not set (MetaTrader feed required)' });
        try {
            const url = `${marketDataUrl.replace(/\/$/, '')}/fx/history?currency=${encodeURIComponent(currency)}&range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
            const out = await httpGetJson(url);
            if (out.status < 200 || out.status >= 300) {
                return reply.status(503).send({ message: `market-data fx history failed: ${out.status} ${out.text}` });
            }
            return reply.send(out.json);
        }
        catch (error) {
            const baseMsg = error instanceof Error ? error.message : String(error);
            const cause = error instanceof Error ? error.cause : undefined;
            const causeMsg = cause && typeof cause === 'object'
                ? `${String(cause.code ?? '')}${cause.message ? ` ${cause.message}` : ''}`.trim()
                : cause != null
                    ? String(cause)
                    : '';
            const msg = causeMsg ? `${baseMsg}: ${causeMsg}` : baseMsg;
            return reply.status(503).send({
                message: `market-data fx history failed: ${msg}`,
            });
        }
    });
    app.get('/api/v1/fx/quote', async (req, reply) => {
        const q = (req.query ?? {});
        const currencyRaw = String(q.currency ?? 'USD').toUpperCase();
        const currency = isCurrency(currencyRaw) ? currencyRaw : 'USD';
        // 1) Prefer Kafka real-time ticks (MetaTrader -> fx-price-producer -> fx.ticker)
        const memTicks = ticksByCurrency.get(currency);
        const lastMem = memTicks && memTicks.length > 0 ? memTicks[memTicks.length - 1] : null;
        if (lastMem && Number.isFinite(lastMem.rate) && lastMem.rate > 0) {
            return reply.send({
                currency,
                pair: `${currency}BRL`,
                rateBRL: lastMem.rate,
            });
        }
        // 2) Use last persisted rate (keeps value when feed is paused)
        if (redis) {
            try {
                const raw = await redis.get(`${FX_LAST_RATE_KEY_PREFIX}${currency}`);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    const rate = Number(parsed?.rate);
                    if (Number.isFinite(rate) && rate > 0) {
                        return reply.send({
                            currency,
                            pair: `${currency}BRL`,
                            rateBRL: rate,
                            stale: true,
                        });
                    }
                }
            }
            catch {
                // ignore
            }
        }
        // 3) Fallback to market-data HTTP (MetaTrader bridge)
        if (!marketDataUrl) {
            return reply.status(503).send({ message: 'fx quote unavailable: no MetaTrader feed (MARKET_DATA_URL not set and fx.ticker empty)' });
        }
        try {
            const url = `${marketDataUrl.replace(/\/$/, '')}/fx/quote?currency=${encodeURIComponent(currency)}`;
            const out = await httpGetJson(url);
            if (out.status >= 200 && out.status < 300) {
                const rate = Number(out.json?.rate);
                if (Number.isFinite(rate) && rate > 0) {
                    if (redis) {
                        try {
                            await redis.set(`${FX_LAST_RATE_KEY_PREFIX}${currency}`, JSON.stringify({ rate, ts: Date.now() }));
                        }
                        catch {
                            // ignore
                        }
                    }
                    return reply.send({
                        currency,
                        pair: `${currency}BRL`,
                        rateBRL: rate,
                    });
                }
            }
            return reply.status(503).send({ message: `fx quote unavailable: market-data failed: ${out.status} ${out.text}` });
        }
        catch (error) {
            const baseMsg = error instanceof Error ? error.message : String(error);
            return reply.status(503).send({ message: `fx quote unavailable: market-data failed: ${baseMsg}` });
        }
    });
    app.get('/ws/fx', { websocket: true }, (connection, req) => {
        const ws = connection.socket ??
            connection;
        const url = req.url ?? '';
        const u = new URL(url, 'http://localhost');
        const currencyRaw = String(u.searchParams.get('currency') ?? 'USD').toUpperCase();
        const currency = isCurrency(currencyRaw) ? currencyRaw : 'USD';
        ensurePolling(currency);
        const set = subsByCurrency.get(currency) ?? new Set();
        set.add(ws);
        subsByCurrency.set(currency, set);
        ws.on('close', () => {
            const s = subsByCurrency.get(currency);
            if (s)
                s.delete(ws);
        });
    });
    app.addHook('onClose', async () => {
        stopping = true;
        for (const t of timers.values()) {
            clearInterval(t);
        }
        timers.clear();
        subsByCurrency.clear();
        ticksByCurrency.clear();
        try {
            await consumer.disconnect();
        }
        catch {
            // ignore
        }
    });
}
//# sourceMappingURL=fx.js.map
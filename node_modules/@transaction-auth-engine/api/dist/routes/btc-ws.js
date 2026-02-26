"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.btcWsRoutes = btcWsRoutes;
const kafkajs_1 = require("kafkajs");
const node_dns_1 = __importDefault(require("node:dns"));
const TOPIC = 'btc.ticker';
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
async function btcWsRoutes(app, opts) {
    const { brokers, mercadoBitcoin } = opts;
    const marketDataUrl = process.env.MARKET_DATA_URL;
    const subs = new Set();
    const intervalSeconds = (interval) => {
        if (interval === '1m')
            return 60;
        if (interval === '5m')
            return 5 * 60;
        if (interval === '15m')
            return 15 * 60;
        return 60;
    };
    const intervalToResolution = (interval) => {
        // Mercado Bitcoin public candles supports: 1m, 15m, 1h, 3h, 1d, 1w, 1M
        if (interval === '1m')
            return '1m';
        if (interval === '15m')
            return '15m';
        if (interval === '5m')
            return '1m';
        return '1m';
    };
    const rangeSeconds = (range) => {
        if (range === '1h')
            return 3600;
        if (range === '6h')
            return 6 * 3600;
        if (range === '1d')
            return 24 * 3600;
        return 3600;
    };
    async function httpGetJson(url) {
        const res = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(15_000),
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
    async function getUsdBrlRateFromMarketData() {
        if (!marketDataUrl)
            throw new Error('MARKET_DATA_URL is not set');
        const out = await httpGetJson(`${marketDataUrl}/fx/quote?currency=USD`);
        if (out.status < 200 || out.status >= 300) {
            throw new Error(`market-data fx quote failed: ${out.status} ${out.text}`);
        }
        const rate = Number(out.json?.rate);
        if (!Number.isFinite(rate) || rate <= 0) {
            throw new Error('market-data fx quote failed: invalid rate');
        }
        return rate;
    }
    app.get('/api/v1/btc/quote', async (_req, reply) => {
        if (marketDataUrl) {
            try {
                const out = await httpGetJson(`${marketDataUrl}/crypto/BTC/quote`);
                if (out.status >= 200 && out.status < 300) {
                    const priceBRL = Number(out.json?.price);
                    if (Number.isFinite(priceBRL) && priceBRL > 0) {
                        return reply.send({ symbol: 'BTCBRL', priceBRL });
                    }
                }
            }
            catch {
                // ignore and fallback
            }
        }
        if (typeof mercadoBitcoin.getBtcBrlTicker === 'function') {
            try {
                const t = await mercadoBitcoin.getBtcBrlTicker();
                return reply.send({ symbol: 'BTCBRL', priceBRL: t.priceBRL });
            }
            catch (err) {
                const baseMsg = err instanceof Error ? err.message : String(err);
                return reply.status(503).send({ message: `btc quote failed: ${baseMsg}` });
            }
        }
        return reply.status(503).send({ message: 'btc quote failed: MercadoBitcoin ticker unavailable in this build' });
    });
    app.get('/api/v1/btc/history', async (req, reply) => {
        const q = (req.query ?? {});
        const range = q.range ?? '1h';
        const interval = q.interval ?? '1m';
        try {
            if (marketDataUrl) {
                try {
                    const usdBrl = await getUsdBrlRateFromMarketData();
                    const url = `${marketDataUrl}/crypto/BTC/history?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
                    const out = await httpGetJson(url);
                    if (out.status >= 200 && out.status < 300) {
                        const candles = out.json?.candles;
                        const data = (Array.isArray(candles) ? candles : [])
                            .map((c) => ({
                            time: Number(c?.time),
                            open: Number(c?.open) * usdBrl,
                            high: Number(c?.high) * usdBrl,
                            low: Number(c?.low) * usdBrl,
                            close: Number(c?.close) * usdBrl,
                            volume: c?.volume != null ? Number(c?.volume) : undefined,
                        }))
                            .filter((c) => Number.isFinite(c.time) &&
                            Number.isFinite(c.open) &&
                            Number.isFinite(c.high) &&
                            Number.isFinite(c.low) &&
                            Number.isFinite(c.close))
                            .sort((a, b) => a.time - b.time);
                        if (data.length > 0) {
                            return reply.send({ symbol: 'BTCBRL', range, interval, data });
                        }
                    }
                }
                catch {
                    // ignore and fallback
                }
            }
            const nowSec = Math.floor(Date.now() / 1000);
            const fromSec = nowSec - rangeSeconds(range);
            const resolution = intervalToResolution(interval);
            const data = await mercadoBitcoin.getBtcBrlCandles({ fromSec, toSec: nowSec, resolution });
            if (!Array.isArray(data) || data.length <= 0) {
                return reply.status(503).send({ message: 'btc history failed: empty candles' });
            }
            return reply.send({ symbol: 'BTCBRL', range, interval, data });
        }
        catch (err) {
            const baseMsg = err instanceof Error ? err.message : String(err);
            const cause = err instanceof Error ? err.cause : undefined;
            const causeMsg = cause && typeof cause === 'object'
                ? `${String(cause.code ?? '')}${cause.message ? ` ${cause.message}` : ''}`.trim()
                : cause != null
                    ? String(cause)
                    : '';
            const msg = causeMsg ? `${baseMsg}: ${causeMsg}` : baseMsg;
            return reply.status(503).send({ message: `btc history failed: ${msg}` });
        }
    });
    const kafka = new kafkajs_1.Kafka({
        clientId: 'api-btc-bridge',
        brokers,
        retry: { retries: 0 },
        logLevel: kafkajs_1.logLevel.NOTHING,
    });
    const consumer = kafka.consumer({ groupId: 'api-btc-bridge' });
    let stopping = false;
    let started = false;
    const startConsumer = async () => {
        if (started || stopping)
            return;
        started = true;
        try {
            await consumer.connect();
            await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
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
                    const price = Number(tick.priceBRL);
                    if (!Number.isFinite(price) || price <= 0)
                        return;
                    const tsMs = tick.timestamp ? Date.parse(tick.timestamp) : Date.now();
                    const ts = Number.isFinite(tsMs) ? tsMs : Date.now();
                    const payload = JSON.stringify({ type: 'tick', symbol: 'BTCBRL', priceBRL: price, ts });
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
    app.get('/ws/btc', { websocket: true }, (connection) => {
        const ws = connection.socket ??
            connection;
        subs.add(ws);
        ws.on('close', () => {
            subs.delete(ws);
        });
    });
    app.addHook('onClose', async () => {
        stopping = true;
        try {
            await consumer.disconnect();
        }
        catch {
            // ignore
        }
    });
}
//# sourceMappingURL=btc-ws.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const kafkajs_1 = require("kafkajs");
const shared_1 = require("@transaction-auth-engine/shared");
const TOPIC = 'stocks.ticker';
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const BRAPI_TOKEN = process.env.BRAPI_TOKEN;
const SYMBOLS = (process.env.STOCK_SYMBOLS ?? 'PETR4,VALE3,MGLU3,ITUB4')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
const POLL_MS = Number(process.env.STOCK_TICKER_POLL_MS ?? 1500);
async function main() {
    const logger = (0, shared_1.createLogger)('stock-ticker-producer');
    const brapi = new shared_1.BrapiClient({ token: BRAPI_TOKEN });
    const kafka = new kafkajs_1.Kafka({ clientId: 'stock-ticker-producer', brokers: KAFKA_BROKERS });
    const producer = kafka.producer();
    await producer.connect();
    logger.info({ brokers: KAFKA_BROKERS, symbols: SYMBOLS, pollMs: POLL_MS }, 'Stock ticker producer connected');
    const timer = setInterval(async () => {
        try {
            const quotes = await Promise.all(SYMBOLS.map(async (symbol) => {
                const url = `https://brapi.dev/api/quote/${encodeURIComponent(symbol)}`;
                const token = brapi.config?.token;
                const qs = new URLSearchParams({ range: '1d', interval: '1m' });
                if (token)
                    qs.set('token', token);
                const res = await fetch(`${url}?${qs.toString()}`, { method: 'GET' });
                if (!res.ok) {
                    throw new Error(`brapi ${symbol} failed: ${res.status}`);
                }
                const data = (await res.json());
                const first = Array.isArray(data.results) ? data.results[0] : undefined;
                const items = first?.historicalDataPrice;
                const last = Array.isArray(items) && items.length ? items[items.length - 1] : undefined;
                const price = Number(first?.regularMarketPrice ?? last?.close);
                const tsMs = Date.now();
                if (!Number.isFinite(price) || price <= 0) {
                    throw new Error(`brapi ${symbol} missing price`);
                }
                return { symbol: (first?.symbol ?? symbol).toUpperCase(), priceBRL: price, ts: tsMs };
            }));
            await producer.send({
                topic: TOPIC,
                messages: quotes.map((q) => ({ key: q.symbol, value: JSON.stringify(q) })),
            });
        }
        catch (err) {
            logger.error({ err }, 'Stock ticker poll failed');
        }
    }, POLL_MS);
    const shutdown = async () => {
        clearInterval(timer);
        await producer.disconnect();
        logger.info('stock-ticker-producer stopped');
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});

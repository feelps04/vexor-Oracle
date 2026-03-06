"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const kafkajs_1 = require("kafkajs");
const shared_1 = require("@transaction-auth-engine/shared");
const TOPIC = String(process.env.KAFKA_TOPIC ?? 'btc.ticker');
const INTERVAL_MS = 1000;
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
    const logger = (0, shared_1.createLogger)('btc-price-producer');
    const kafka = new kafkajs_1.Kafka({
        clientId: 'btc-price-producer',
        brokers: KAFKA_BROKERS,
        retry: {
            retries: 10,
            initialRetryTime: 300,
            maxRetryTime: 10_000,
        },
    });
    const producer = kafka.producer();
    let backoff = 500;
    while (true) {
        try {
            await producer.connect();
            break;
        }
        catch (err) {
            logger.warn({ err, backoff }, 'Kafka connect failed; retrying');
            await sleep(backoff);
            backoff = Math.min(10_000, backoff * 2);
        }
    }
    const mercadoBitcoin = new shared_1.MercadoBitcoinClient();
    let lastPrice = Number(process.env.BTC_SIM_START_PRICE_BRL ?? 350_000);
    const SIM_VOLATILITY_BPS = Number(process.env.BTC_SIM_VOLATILITY_BPS ?? 8); // 8 bps ~ 0.08%
    const sendPrice = async () => {
        try {
            let priceBRL;
            try {
                const live = await mercadoBitcoin.getBtcBrlTicker();
                priceBRL = Number(live.priceBRL);
            }
            catch (err) {
                const dir = Math.random() < 0.5 ? -1 : 1;
                const magnitudeBps = Math.random() * SIM_VOLATILITY_BPS;
                const next = lastPrice * (1 + dir * magnitudeBps / 10_000);
                lastPrice = Math.max(1, next);
                priceBRL = lastPrice;
                logger.warn({ err }, 'Mercado Bitcoin unavailable; using simulated BTC tick');
            }
            if (!Number.isFinite(priceBRL) || priceBRL <= 0)
                return;
            const now = Date.now();
            const payload = JSON.stringify({
                type: 'tick',
                symbol: 'BTCBRL',
                timestamp: new Date(now).toISOString(),
                ts: now,
                priceBRL,
            });
            await producer.send({
                topic: TOPIC,
                messages: [{ key: 'BTCBRL', value: payload }],
            });
            logger.debug({ priceBRL }, 'Sent BTC ticker');
        }
        catch (err) {
            logger.warn({ err }, 'Failed to fetch/send BTC price');
        }
    };
    await sendPrice();
    const interval = setInterval(sendPrice, INTERVAL_MS);
    const shutdown = async () => {
        clearInterval(interval);
        await producer.disconnect();
        logger.info('btc-price-producer stopped');
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});

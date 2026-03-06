"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const kafkajs_1 = require("kafkajs");
const shared_1 = require("@transaction-auth-engine/shared");
const TOPIC = 'fx.ticker';
const INTERVAL_MS = 100; // 100ms = 10 ticks por segundo
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const PAIRS = ['USDBRL=X', 'EURBRL=X'];
// Simula movimento de mercado FX real
function generateRealisticMovement(basePrice) {
    const volatility = 0.0002; // 0.02% de volatilidade por tick (FX é menos volátil)
    const direction = Math.random() > 0.5 ? 1 : -1;
    const magnitude = Math.random() * volatility * basePrice;
    return basePrice + direction * magnitude;
}
async function main() {
    const logger = (0, shared_1.createLogger)('fx-price-producer');
    const kafka = new kafkajs_1.Kafka({ clientId: 'fx-price-producer', brokers: KAFKA_BROKERS });
    const producer = kafka.producer();
    await producer.connect();
    const yahoo = new shared_1.YahooFinanceClient();
    // Busca preços iniciais
    const fxPrices = new Map();
    try {
        for (const pair of PAIRS) {
            const candles = await yahoo.getFxCandles({
                pair,
                interval: '1m',
                range: '1h',
            });
            const lastCandle = candles[candles.length - 1];
            const currency = pair.replace('BRL=X', '');
            fxPrices.set(pair, {
                pair,
                currency,
                price: lastCandle.close,
                open: lastCandle.open,
                high: lastCandle.high,
                low: lastCandle.low,
                close: lastCandle.close,
                timestamp: new Date().toISOString(),
            });
        }
        logger.info({ pairs: PAIRS }, 'FX prices initialized from Yahoo');
    }
    catch (err) {
        logger.warn({ err }, 'Failed to fetch initial prices, using simulated values');
        // Valores simulados caso a API falhe
        for (const pair of PAIRS) {
            const basePrice = pair.includes('USD') ? 5.0 : 6.0;
            const currency = pair.replace('BRL=X', '');
            fxPrices.set(pair, {
                pair,
                currency,
                price: basePrice,
                open: basePrice,
                high: basePrice,
                low: basePrice,
                close: basePrice,
                timestamp: new Date().toISOString(),
            });
        }
    }
    const sendTicks = async () => {
        try {
            for (const [pair, lastPrice] of fxPrices) {
                // Gera novo preço com movimento realista
                const newPrice = generateRealisticMovement(lastPrice.price);
                const now = new Date();
                // Atualiza OHLC
                const updated = {
                    pair,
                    currency: lastPrice.currency,
                    price: newPrice,
                    open: lastPrice.open,
                    high: Math.max(lastPrice.high, newPrice),
                    low: Math.min(lastPrice.low, newPrice),
                    close: newPrice,
                    timestamp: now.toISOString(),
                };
                fxPrices.set(pair, updated);
                // Envia para Kafka
                const payload = JSON.stringify({
                    type: 'tick',
                    pair: lastPrice.currency + 'BRL',
                    currency: lastPrice.currency,
                    rate: newPrice,
                    open: updated.open,
                    high: updated.high,
                    low: updated.low,
                    close: updated.close,
                    timestamp: now.toISOString(),
                    ts: Math.floor(now.getTime() / 1000),
                });
                await producer.send({
                    topic: TOPIC,
                    messages: [{ key: lastPrice.currency, value: payload }],
                });
            }
        }
        catch (err) {
            logger.warn({ err }, 'Failed to send FX ticks');
        }
    };
    // Envia ticks a cada 100ms
    const interval = setInterval(sendTicks, INTERVAL_MS);
    const shutdown = async () => {
        clearInterval(interval);
        await producer.disconnect();
        logger.info('fx-price-producer stopped');
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    logger.info({ interval: INTERVAL_MS, pairs: PAIRS }, 'FX price producer started');
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const kafkajs_1 = require("kafkajs");
const shared_1 = require("@transaction-auth-engine/shared");
const TOPIC = 'btc.ticker';
const INTERVAL_MS = 1000;
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
async function main() {
    const logger = (0, shared_1.createLogger)('btc-price-producer');
    const kafka = new kafkajs_1.Kafka({ clientId: 'btc-price-producer', brokers: KAFKA_BROKERS });
    const producer = kafka.producer();
    await producer.connect();
    const mercadoBitcoin = new shared_1.MercadoBitcoinClient();
    const sendPrice = async () => {
        try {
            const { priceBRL } = await mercadoBitcoin.getBtcBrlTicker();
            const payload = JSON.stringify({
                timestamp: new Date().toISOString(),
                priceBRL,
            });
            await producer.send({
                topic: TOPIC,
                messages: [{ key: 'btcbrl', value: payload }],
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
//# sourceMappingURL=main.js.map
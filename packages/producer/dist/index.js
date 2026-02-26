"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@transaction-auth-engine/shared");
const kafka_producer_js_1 = require("./infrastructure/kafka-producer.js");
const produce_transactions_js_1 = require("./use-cases/produce-transactions.js");
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
async function main() {
    const logger = (0, shared_1.createLogger)('producer');
    const producer = new kafka_producer_js_1.TransactionKafkaProducer({
        brokers: KAFKA_BROKERS,
        batchSize: 100,
        batchDelayMs: 50,
        logger,
    });
    await producer.connect();
    await (0, produce_transactions_js_1.runProduceLoop)(producer, logger);
    const shutdown = async () => {
        logger.info('Shutting down producer...');
        await producer.disconnect();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map
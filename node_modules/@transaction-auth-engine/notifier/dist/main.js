"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@transaction-auth-engine/shared");
const kafka_consumer_js_1 = require("./kafka-consumer.js");
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL ?? 'http://localhost:9999/webhook';
async function main() {
    const logger = (0, shared_1.createLogger)('notifier');
    const consumer = new kafka_consumer_js_1.NotifierConsumer({
        brokers: KAFKA_BROKERS,
        groupId: 'notifier-group',
        webhookBaseUrl: WEBHOOK_BASE_URL,
        logger,
    });
    await consumer.connect();
    await consumer.run();
    const stop = async () => {
        logger.info('Notifier Graceful Shutdown...');
        await consumer.disconnect();
        process.exit(0);
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});

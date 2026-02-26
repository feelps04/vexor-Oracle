"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const shared_1 = require("@transaction-auth-engine/shared");
const redis_balance_repository_js_1 = require("./infrastructure/redis-balance-repository.js");
const redis_idempotency_repository_js_1 = require("./infrastructure/redis-idempotency-repository.js");
const kafka_consumer_js_1 = require("./infrastructure/kafka-consumer.js");
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
async function main() {
    const logger = (0, shared_1.createLogger)('consumer');
    const redis = new ioredis_1.default(REDIS_URL);
    const balanceRepo = new redis_balance_repository_js_1.RedisBalanceRepository(redis);
    const idempotencyRepo = new redis_idempotency_repository_js_1.RedisIdempotencyRepository(redis);
    const currencyConverter = new shared_1.CurrencyConverter();
    const latencySensor = new shared_1.LatencySensor({
        highLatencyThresholdMs: Number(process.env.BACKPRESSURE_LATENCY_THRESHOLD_MS) || 2000,
        backpressurePauseMs: Number(process.env.BACKPRESSURE_PAUSE_MS) || 1500,
    });
    const consumer = new kafka_consumer_js_1.AuthEngineConsumer({
        brokers: KAFKA_BROKERS,
        groupId: 'auth-engine-group',
        logger,
        balanceRepository: balanceRepo,
        idempotencyRepository: idempotencyRepo,
        maxRetries: 3,
        redis,
        currencyConverter,
        latencySensor,
    });
    await consumer.connect();
    await consumer.run();
    const stop = async () => {
        logger.info('Iniciando Graceful Shutdown...');
        await consumer.disconnect();
        logger.info('Kafka Consumer desconectado.');
        await redis.quit();
        logger.info('Redis desconectado.');
        process.exit(0);
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map
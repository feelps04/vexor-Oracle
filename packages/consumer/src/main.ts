import Redis from 'ioredis';
import { createLogger, CurrencyConverter, LatencySensor } from '@transaction-auth-engine/shared';
import { RedisBalanceRepository } from './infrastructure/redis-balance-repository.js';
import { RedisIdempotencyRepository } from './infrastructure/redis-idempotency-repository.js';
import { AuthEngineConsumer } from './infrastructure/kafka-consumer.js';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function main(): Promise<void> {
  const logger = createLogger('consumer');
  const redis = new Redis(REDIS_URL);

  const balanceRepo = new RedisBalanceRepository(redis);
  const idempotencyRepo = new RedisIdempotencyRepository(redis);
  const currencyConverter = new CurrencyConverter();
  const latencySensor = new LatencySensor({
    highLatencyThresholdMs: Number(process.env.BACKPRESSURE_LATENCY_THRESHOLD_MS) || 2000,
    backpressurePauseMs: Number(process.env.BACKPRESSURE_PAUSE_MS) || 1500,
  });

  const consumer = new AuthEngineConsumer({
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

  const stop = async (): Promise<void> => {
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

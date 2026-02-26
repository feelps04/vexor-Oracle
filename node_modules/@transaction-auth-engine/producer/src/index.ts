import { createLogger } from '@transaction-auth-engine/shared';
import { TransactionKafkaProducer } from './infrastructure/kafka-producer.js';
import { runProduceLoop } from './use-cases/produce-transactions.js';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');

async function main(): Promise<void> {
  const logger = createLogger('producer');
  const producer = new TransactionKafkaProducer({
    brokers: KAFKA_BROKERS,
    batchSize: 100,
    batchDelayMs: 50,
    logger,
  });

  await producer.connect();

  await runProduceLoop(producer, logger);

  const shutdown = async (): Promise<void> => {
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

import type { Logger } from '@transaction-auth-engine/shared';
import type { TransactionKafkaProducer } from '../infrastructure/kafka-producer.js';
import {
  generateTransactionBatch,
  type TransactionGeneratorOptions,
} from '../infrastructure/transaction-generator.js';

const DEFAULT_TPS = 1000;
const MIN_BATCH = 50;
const MAX_BATCH = 100;

export interface ProduceTransactionsConfig {
  transactionsPerSecond?: number;
  batchSizeMin?: number;
  batchSizeMax?: number;
  generatorOptions?: TransactionGeneratorOptions;
}

export async function runProduceLoop(
  producer: TransactionKafkaProducer,
  logger: Logger,
  config: ProduceTransactionsConfig = {}
): Promise<void> {
  const tps = config.transactionsPerSecond ?? Number(process.env.TRANSACTIONS_PER_SECOND) ?? DEFAULT_TPS;
  const batchMin = config.batchSizeMin ?? MIN_BATCH;
  const batchMax = config.batchSizeMax ?? MAX_BATCH;

  const intervalMs = 50;
  const batchSize = Math.min(MAX_BATCH, Math.max(MIN_BATCH, Math.floor(tps / (1000 / intervalMs))));
  const targetPerTick = Math.min(batchSize, Math.ceil((tps * intervalMs) / 1000));

  logger.info(
    { tps, batchSize: targetPerTick, intervalMs },
    'Starting transaction producer loop'
  );

  setInterval(async () => {
    try {
      const batch = generateTransactionBatch(targetPerTick, config.generatorOptions);
      await producer.sendBatch(batch);
    } catch (err) {
      logger.error({ err }, 'Produce loop error');
    }
  }, intervalMs);
}

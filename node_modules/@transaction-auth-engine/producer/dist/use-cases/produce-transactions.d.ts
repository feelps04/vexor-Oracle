import type { Logger } from '@transaction-auth-engine/shared';
import type { TransactionKafkaProducer } from '../infrastructure/kafka-producer.js';
import { type TransactionGeneratorOptions } from '../infrastructure/transaction-generator.js';
export interface ProduceTransactionsConfig {
    transactionsPerSecond?: number;
    batchSizeMin?: number;
    batchSizeMax?: number;
    generatorOptions?: TransactionGeneratorOptions;
}
export declare function runProduceLoop(producer: TransactionKafkaProducer, logger: Logger, config?: ProduceTransactionsConfig): Promise<void>;
//# sourceMappingURL=produce-transactions.d.ts.map
import type { Logger } from '@transaction-auth-engine/shared';
import type { Transaction } from '@transaction-auth-engine/core';
export interface KafkaProducerConfig {
    brokers: string[];
    batchSize?: number;
    batchDelayMs?: number;
    logger: Logger;
}
export declare class TransactionKafkaProducer {
    private readonly kafka;
    private producer;
    private readonly batchSize;
    private readonly batchDelayMs;
    private readonly logger;
    private pending;
    private flushTimer;
    constructor(config: KafkaProducerConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(transaction: Transaction): Promise<void>;
    flush(): Promise<void>;
    sendBatch(transactions: Transaction[]): Promise<void>;
}
//# sourceMappingURL=kafka-producer.d.ts.map
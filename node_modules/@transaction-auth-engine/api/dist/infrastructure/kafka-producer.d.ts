import type { Transaction } from '@transaction-auth-engine/core';
export interface ApiKafkaProducerConfig {
    brokers: string[];
}
export declare class ApiKafkaProducer {
    private readonly kafka;
    private producer;
    private enabled;
    constructor(config: ApiKafkaProducerConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendTransaction(transaction: Transaction): Promise<void>;
    isEnabled(): boolean;
}
//# sourceMappingURL=kafka-producer.d.ts.map
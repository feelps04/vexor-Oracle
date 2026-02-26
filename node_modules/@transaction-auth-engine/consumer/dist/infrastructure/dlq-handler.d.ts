import type { Kafka } from 'kafkajs';
import type { Logger } from '@transaction-auth-engine/shared';
export interface DLQMessage {
    originalPayload: unknown;
    reason: string;
    retryCount: number;
}
export declare class DLQHandler {
    private readonly kafka;
    private readonly logger;
    private producer;
    constructor(kafka: Kafka, logger: Logger);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(message: DLQMessage): Promise<void>;
}
//# sourceMappingURL=dlq-handler.d.ts.map
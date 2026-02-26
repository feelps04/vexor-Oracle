import type { Logger } from '@transaction-auth-engine/shared';
export interface NotifierConsumerConfig {
    brokers: string[];
    groupId: string;
    webhookBaseUrl: string;
    logger: Logger;
}
export declare class NotifierConsumer {
    private readonly kafka;
    private readonly groupId;
    private consumer;
    private readonly logger;
    private readonly dispatcher;
    constructor(config: NotifierConsumerConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    run(): Promise<void>;
    private handleMessage;
}
//# sourceMappingURL=kafka-consumer.d.ts.map
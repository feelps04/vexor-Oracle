import type { Logger } from '@transaction-auth-engine/shared';
import type { BalanceRepository } from '@transaction-auth-engine/shared';
import type { IdempotencyRepository } from '@transaction-auth-engine/shared';
import { CurrencyConverter } from './exchange-service.js';
import { type LatencySensor } from '@transaction-auth-engine/shared';
export interface AuthEngineConsumerConfig {
    brokers: string[];
    groupId: string;
    logger: Logger;
    balanceRepository: BalanceRepository;
    idempotencyRepository: IdempotencyRepository;
    maxRetries?: number;
    /** Optional Redis for retry counting; if not set, first failure goes to DLQ */
    redis?: {
        incr(key: string): Promise<number>;
        expire(key: string, seconds: number): Promise<unknown>;
    };
    /** For multi-currency: convert to BRL when amountBRL not in message */
    currencyConverter?: CurrencyConverter;
    /** Optional latency sensor for backpressure: pause between messages when external APIs are slow */
    latencySensor?: LatencySensor;
}
export declare class AuthEngineConsumer {
    private readonly kafka;
    private readonly groupId;
    private consumer;
    private resultProducer;
    private readonly logger;
    private readonly balanceRepo;
    private readonly idempotencyRepo;
    private readonly dlqHandler;
    private readonly maxRetries;
    private readonly redis?;
    private readonly currencyConverter?;
    private readonly latencySensor?;
    constructor(config: AuthEngineConsumerConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    run(): Promise<void>;
    private handleMessage;
    private incrementAndGetRetryCount;
    private processMessage;
    private sendToDLQ;
}
//# sourceMappingURL=kafka-consumer.d.ts.map
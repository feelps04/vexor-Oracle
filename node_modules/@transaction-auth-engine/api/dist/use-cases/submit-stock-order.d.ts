import { Transaction } from '@transaction-auth-engine/core';
import type { ApiKafkaProducer } from '../infrastructure/kafka-producer.js';
import type { BrapiClient } from '@transaction-auth-engine/shared';
export interface SubmitStockOrderInput {
    accountId: string;
    symbol: string;
    quantity: number;
    idempotencyKey: string;
    merchantId?: string;
    /** Optional pre-fetched stock price in BRL. */
    priceBRL?: number;
    /** Optional resolved symbol from quote provider. */
    quoteSymbol?: string;
}
/** Fetches stock price from Brapi, builds order payload, sends to Kafka. */
export declare function submitStockOrder(producer: ApiKafkaProducer, brapi: BrapiClient, input: SubmitStockOrderInput): Promise<Transaction>;
//# sourceMappingURL=submit-stock-order.d.ts.map
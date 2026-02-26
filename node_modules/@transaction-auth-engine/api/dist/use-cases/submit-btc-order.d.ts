import { Transaction } from '@transaction-auth-engine/core';
import type { ApiKafkaProducer } from '../infrastructure/kafka-producer.js';
import type { MercadoBitcoinClient } from '@transaction-auth-engine/shared';
export interface SubmitBtcOrderInput {
    accountId: string;
    /** BTC amount (e.g. 0.001). */
    amountBtc: number;
    idempotencyKey: string;
    merchantId?: string;
    /** Optional pre-fetched BTC price in BRL. */
    priceBRL?: number;
}
/** Fetches BTC price from Mercado Bitcoin, builds order payload, sends to Kafka. */
export declare function submitBtcOrder(producer: ApiKafkaProducer, mercadoBitcoin: MercadoBitcoinClient, input: SubmitBtcOrderInput): Promise<Transaction>;
//# sourceMappingURL=submit-btc-order.d.ts.map
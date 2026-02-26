import { Transaction } from '@transaction-auth-engine/core';
import type { ApiKafkaProducer } from '../infrastructure/kafka-producer.js';
export interface SubmitTransactionInput {
    accountId: string;
    amount: number;
    currency: string;
    merchantId: string;
    idempotencyKey: string;
    targetBankCode?: string;
    amountBRL?: number;
    rate?: number;
    bankName?: string;
    biometricToken?: string;
}
export declare function submitTransaction(producer: ApiKafkaProducer, input: SubmitTransactionInput): Promise<Transaction>;
//# sourceMappingURL=submit-transaction.d.ts.map
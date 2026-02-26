import { Transaction } from '@transaction-auth-engine/core';
export interface TransactionGeneratorOptions {
    currency?: string;
    minAmount?: number;
    maxAmount?: number;
    accountCount?: number;
}
export declare function generateTransaction(options?: TransactionGeneratorOptions): Transaction;
export declare function generateTransactionBatch(count: number, options?: TransactionGeneratorOptions): Transaction[];
//# sourceMappingURL=transaction-generator.d.ts.map
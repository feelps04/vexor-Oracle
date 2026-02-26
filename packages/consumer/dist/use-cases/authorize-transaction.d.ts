import { Transaction, type TransactionPayload } from '@transaction-auth-engine/core';
import type { BalanceRepository } from '@transaction-auth-engine/shared';
import type { IdempotencyRepository } from '@transaction-auth-engine/shared';
import type { Logger } from '@transaction-auth-engine/shared';
export type AuthResult = {
    authorized: boolean;
    transaction: Transaction;
};
export interface AuthorizeTransactionOptions {
    /** When true, idempotency was already acquired by caller (e.g. holiday branch). */
    skipAcquire?: boolean;
}
export declare function authorizeTransaction(payload: TransactionPayload, balanceRepo: BalanceRepository, idempotencyRepo: IdempotencyRepository, logger: Logger, options?: AuthorizeTransactionOptions): Promise<AuthResult>;
//# sourceMappingURL=authorize-transaction.d.ts.map
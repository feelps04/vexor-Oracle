import { Transaction, type TransactionPayload } from '@transaction-auth-engine/core';
import type { BalanceRepository } from '@transaction-auth-engine/shared';
import type { IdempotencyRepository } from '@transaction-auth-engine/shared';
import type { Logger } from '@transaction-auth-engine/shared';

export type AuthResult = { authorized: boolean; transaction: Transaction };

export interface AuthorizeTransactionOptions {
  /** When true, idempotency was already acquired by caller (e.g. holiday branch). */
  skipAcquire?: boolean;
}

export async function authorizeTransaction(
  payload: TransactionPayload,
  balanceRepo: BalanceRepository,
  idempotencyRepo: IdempotencyRepository,
  logger: Logger,
  options?: AuthorizeTransactionOptions
): Promise<AuthResult> {
  const transaction = Transaction.fromJSON(payload);

  if (!options?.skipAcquire) {
    const acquired = await idempotencyRepo.tryAcquire(transaction.idempotencyKey);
    if (!acquired) {
      logger.debug({ idempotencyKey: transaction.idempotencyKey }, 'Duplicate transaction, skipping');
      throw new Error('IDEMPOTENT_SKIP');
    }
  }

  const debitAmount = transaction.getDebitAmount();
  const authorized = await balanceRepo.tryDebit(transaction.accountId, debitAmount);
  transaction.status = authorized ? 'AUTHORIZED' : 'DENIED';

  await idempotencyRepo.complete(transaction.idempotencyKey, {
    authorized,
    status: transaction.status,
  });

  return { authorized, transaction };
}

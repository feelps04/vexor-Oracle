import { randomUUID } from 'crypto';
import { Transaction } from '@transaction-auth-engine/core';

const DEFAULT_CURRENCY = 'BRL';
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 500;
const DEFAULT_ACCOUNT_COUNT = 1000;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface TransactionGeneratorOptions {
  currency?: string;
  minAmount?: number;
  maxAmount?: number;
  accountCount?: number;
}

export function generateTransaction(
  options: TransactionGeneratorOptions = {}
): Transaction {
  const {
    currency = DEFAULT_CURRENCY,
    minAmount = MIN_AMOUNT,
    maxAmount = MAX_AMOUNT,
    accountCount = DEFAULT_ACCOUNT_COUNT,
  } = options;

  const accountId = `acc-${randomInt(1, accountCount)}`;
  const amount = randomInt(minAmount, maxAmount) * 100; // cents
  const idempotencyKey = randomUUID();
  const id = randomUUID();
  const merchantId = `merchant-${randomInt(1, 100)}`;

  return new Transaction(
    id,
    idempotencyKey,
    accountId,
    amount,
    currency,
    merchantId,
    'PENDING'
  );
}

export function generateTransactionBatch(
  count: number,
  options?: TransactionGeneratorOptions
): Transaction[] {
  const batch: Transaction[] = [];
  for (let i = 0; i < count; i++) {
    batch.push(generateTransaction(options));
  }
  return batch;
}

import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import { createLogger } from '@transaction-auth-engine/shared';
import { Transaction } from '@transaction-auth-engine/core';
import type { TransactionPayload } from '@transaction-auth-engine/core';

const TOPIC_AUTHORIZED = 'transactions.authorized';
const INITIAL_BALANCE = 10_000; // same as Redis default (cents)

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/settlement';

async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mirror_balances (
      account_id VARCHAR(255) PRIMARY KEY,
      balance_brl BIGINT NOT NULL DEFAULT ${INITIAL_BALANCE}
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mirror_transactions (
      id UUID PRIMARY KEY,
      account_id VARCHAR(255) NOT NULL,
      amount_brl_debit BIGINT NOT NULL,
      status VARCHAR(50) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function mirrorAuthorizedTransaction(
  pool: Pool,
  payload: TransactionPayload
): Promise<void> {
  const tx = Transaction.fromJSON(payload);
  const debitAmount = tx.getDebitAmount();

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO mirror_balances (account_id, balance_brl) VALUES ($1, $2)
       ON CONFLICT (account_id) DO NOTHING`,
      [tx.accountId, INITIAL_BALANCE]
    );
    await client.query(
      `UPDATE mirror_balances SET balance_brl = balance_brl - $1 WHERE account_id = $2`,
      [debitAmount, tx.accountId]
    );
    await client.query(
      `INSERT INTO mirror_transactions (id, account_id, amount_brl_debit, status, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [tx.id, tx.accountId, debitAmount, tx.status]
    );
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const logger = createLogger('shadow-mirror');
  const pool = new Pool({ connectionString: DATABASE_URL });

  await ensureSchema(pool);
  logger.info('PostgreSQL schema ready');

  const kafka = new Kafka({ clientId: 'shadow-mirror', brokers: KAFKA_BROKERS });
  const consumer = kafka.consumer({ groupId: 'shadow-mirror-group' });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_AUTHORIZED, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const value = message.value?.toString();
      if (!value) return;
      let parsed: TransactionPayload;
      try {
        parsed = JSON.parse(value) as TransactionPayload;
      } catch {
        return;
      }
      try {
        await mirrorAuthorizedTransaction(pool, parsed);
        logger.debug({ transactionId: parsed.id, accountId: parsed.accountId }, 'Mirrored');
      } catch (err) {
        logger.error({ err, transactionId: parsed.id }, 'Mirror failed');
        throw err;
      }
    },
  });

  const shutdown = async (): Promise<void> => {
    await consumer.disconnect();
    await pool.end();
    logger.info('shadow-mirror stopped');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

import { Kafka, type Consumer, type EachMessagePayload } from 'kafkajs';
import type { Logger } from '@transaction-auth-engine/shared';
import type { TransactionPayload } from '@transaction-auth-engine/core';
import type { BalanceRepository } from '@transaction-auth-engine/shared';
import type { IdempotencyRepository } from '@transaction-auth-engine/shared';
import { isBankHolidayToday } from '@transaction-auth-engine/shared';
import { Transaction } from '@transaction-auth-engine/core';
import { authorizeTransaction } from '../use-cases/authorize-transaction.js';
import { validateBankCode } from '../use-cases/validate-bank.js';
import { CurrencyConverter } from './exchange-service.js';
import { DLQHandler } from './dlq-handler.js';
import { RedisBalanceRepository } from './redis-balance-repository.js';
import { withCorrelationId, type LatencySensor } from '@transaction-auth-engine/shared';

const TOPIC_PENDING = 'transactions.pending';
const TOPIC_AUTHORIZED = 'transactions.authorized';
const TOPIC_DENIED = 'transactions.denied';
const MAX_RETRIES = 3;
const RETRY_KEY_PREFIX = 'retry:';
const RETRY_KEY_TTL = 3600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AuthEngineConsumerConfig {
  brokers: string[];
  groupId: string;
  logger: Logger;
  balanceRepository: BalanceRepository;
  idempotencyRepository: IdempotencyRepository;
  maxRetries?: number;
  /** Optional Redis for retry counting; if not set, first failure goes to DLQ */
  redis?: { incr(key: string): Promise<number>; expire(key: string, seconds: number): Promise<unknown> };
  /** For multi-currency: convert to BRL when amountBRL not in message */
  currencyConverter?: CurrencyConverter;
  /** Optional latency sensor for backpressure: pause between messages when external APIs are slow */
  latencySensor?: LatencySensor;
}

export class AuthEngineConsumer {
  private readonly kafka: Kafka;
  private readonly groupId: string;
  private consumer: Consumer | null = null;
  private resultProducer: Awaited<ReturnType<Kafka['producer']>> | null = null;
  private readonly logger: Logger;
  private readonly balanceRepo: BalanceRepository;
  private readonly idempotencyRepo: IdempotencyRepository;
  private readonly dlqHandler: DLQHandler;
  private readonly maxRetries: number;
  private readonly redis?: AuthEngineConsumerConfig['redis'];
  private readonly currencyConverter?: CurrencyConverter;
  private readonly latencySensor?: LatencySensor;

  constructor(config: AuthEngineConsumerConfig) {
    this.kafka = new Kafka({
      clientId: 'auth-engine-consumer',
      brokers: config.brokers,
    });
    this.groupId = config.groupId;
    this.logger = config.logger;
    this.balanceRepo = config.balanceRepository;
    this.idempotencyRepo = config.idempotencyRepository;
    this.dlqHandler = new DLQHandler(this.kafka, config.logger);
    this.maxRetries = config.maxRetries ?? MAX_RETRIES;
    this.redis = config.redis;
    this.currencyConverter = config.currencyConverter;
    this.latencySensor = config.latencySensor;
  }

  async connect(): Promise<void> {
    this.consumer = this.kafka.consumer({ groupId: this.groupId });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPIC_PENDING, fromBeginning: false });
    this.resultProducer = this.kafka.producer();
    await this.resultProducer.connect();
    await this.dlqHandler.connect();
    this.logger.info('Auth engine consumer connected');
  }

  async disconnect(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
    if (this.resultProducer) {
      await this.resultProducer.disconnect();
      this.resultProducer = null;
    }
    await this.dlqHandler.disconnect();
    this.logger.info('Auth engine consumer disconnected');
  }

  async run(): Promise<void> {
    if (!this.consumer) throw new Error('Consumer not connected');

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;

    let parsed: TransactionPayload;
    try {
      const value = message.value?.toString();
      if (!value) throw new Error('Empty message value');
      parsed = JSON.parse(value) as TransactionPayload;
    } catch (err) {
      this.logger.error({ err, topic, partition, offset: message.offset }, 'Invalid message');
      await this.sendToDLQ(message.value?.toString() ?? '{}', String(err), 0);
      return;
    }

    try {
      if (this.latencySensor) {
        const backpressureMs = this.latencySensor.getCurrentBackpressureMs();
        if (backpressureMs > 0) {
          this.logger.info(
            { backpressureMs, avgLatencyMs: this.latencySensor.getAverageLatencyMs() },
            '[Backpressure] Pausing before next message (external APIs slow)'
          );
          await sleep(backpressureMs);
        }
      }
      await this.processMessage(parsed, payload);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg === 'IDEMPOTENT_SKIP') return;

      const retryCount = await this.incrementAndGetRetryCount(parsed.idempotencyKey);
      if (retryCount >= this.maxRetries) {
        await this.sendToDLQ(JSON.stringify(parsed), errMsg, retryCount);
      } else {
        throw err;
      }
    }
  }

  private async incrementAndGetRetryCount(idempotencyKey: string): Promise<number> {
    if (!this.redis) return this.maxRetries;
    const key = `${RETRY_KEY_PREFIX}${idempotencyKey}`;
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, RETRY_KEY_TTL);
    return n;
  }

  private async processMessage(
    parsed: TransactionPayload,
    payload: EachMessagePayload
  ): Promise<void> {
    const start = Date.now();
    const correlationId = parsed.correlationId ?? parsed.idempotencyKey;
    const log = withCorrelationId(this.logger, correlationId);

    const acquired = await this.idempotencyRepo.tryAcquire(parsed.idempotencyKey);
    if (!acquired) {
      log.debug({ idempotencyKey: parsed.idempotencyKey }, 'Duplicate transaction, skipping');
      throw new Error('IDEMPOTENT_SKIP');
    }

    if (parsed.targetBankCode) {
      const t0 = Date.now();
      const bank = await validateBankCode(parsed.targetBankCode);
      parsed.bankName = bank.name;
      this.latencySensor?.record(Date.now() - t0);
    }

    const holidayStart = Date.now();
    const isHoliday = await isBankHolidayToday();
    this.latencySensor?.record(Date.now() - holidayStart);
    if (isHoliday) {
      const transaction = Transaction.fromJSON(parsed);
      transaction.status = 'PENDING_SETTLEMENT';
      await this.idempotencyRepo.complete(transaction.idempotencyKey, {
        authorized: false,
        status: 'PENDING_SETTLEMENT',
      });
      if (this.resultProducer) {
        await this.resultProducer.send({
          topic: TOPIC_AUTHORIZED,
          messages: [
            { key: transaction.accountId, value: JSON.stringify(transaction.toJSON()) },
          ],
        });
      }
      log.info(
        { transactionId: parsed.id, accountId: parsed.accountId },
        '[Transaction PENDING_SETTLEMENT] Agendada para próximo dia útil (feriado nacional)'
      );
      return;
    }

    if (parsed.amountBRL == null && parsed.currency !== 'BRL' && this.currencyConverter) {
      const fxStart = Date.now();
      const { amountBRL, rate } = await this.currencyConverter.convertToBRLWithRate(
        parsed.amount,
        parsed.currency
      );
      this.latencySensor?.record(Date.now() - fxStart);
      parsed.amountBRL = amountBRL;
      parsed.rate = rate;
    } else if (parsed.amountBRL == null) {
      parsed.amountBRL = parsed.amount;
    }

    const result = await authorizeTransaction(
      parsed,
      this.balanceRepo,
      this.idempotencyRepo,
      log,
      { skipAcquire: true }
    );

    if (result.authorized && this.balanceRepo instanceof RedisBalanceRepository) {
      const tx = result.transaction;
      if (tx.orderType === 'crypto_buy') {
        const minor = tx.getAmountBtcMinor();
        if (minor > 0) await this.balanceRepo.creditBtc(tx.accountId, minor);
      } else if (tx.orderType === 'stock_buy' && tx.symbol != null && tx.quantity != null) {
        await this.balanceRepo.creditStock(tx.accountId, tx.symbol, tx.quantity);
      }
    }

    if (!this.resultProducer) throw new Error('Result producer not connected');

    const topic = result.authorized ? TOPIC_AUTHORIZED : TOPIC_DENIED;
    const value = JSON.stringify(result.transaction.toJSON());

    await this.resultProducer.send({
      topic,
      messages: [
        {
          key: result.transaction.accountId,
          value,
        },
      ],
    });

    const latencyMs = Date.now() - start;
    const statusLabel = result.authorized ? 'Authorized' : 'Denied';
    log.info(
      {
        transactionId: result.transaction.id,
        accountId: result.transaction.accountId,
        authorized: result.authorized,
        latencyMs,
      },
      `[Transaction ${statusLabel}] Account: ${result.transaction.accountId} | Latency: ${latencyMs}ms`
    );
  }

  private async sendToDLQ(
    originalPayload: string,
    reason: string,
    retryCount: number
  ): Promise<void> {
    let payloadObj: unknown;
    try {
      payloadObj = JSON.parse(originalPayload);
    } catch {
      payloadObj = originalPayload;
    }

    await this.dlqHandler.send({
      originalPayload: payloadObj,
      reason,
      retryCount,
    });
  }
}

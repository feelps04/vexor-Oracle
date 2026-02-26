import { Kafka, type Producer, type ProducerRecord, CompressionTypes } from 'kafkajs';
import type { Logger } from '@transaction-auth-engine/shared';
import type { Transaction } from '@transaction-auth-engine/core';

const TOPIC_PENDING = 'transactions.pending';
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 50;

export interface KafkaProducerConfig {
  brokers: string[];
  batchSize?: number;
  batchDelayMs?: number;
  logger: Logger;
}

export class TransactionKafkaProducer {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private readonly batchSize: number;
  private readonly batchDelayMs: number;
  private readonly logger: Logger;
  private pending: Array<{ key: string; value: string }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: KafkaProducerConfig) {
    this.kafka = new Kafka({
      clientId: 'transaction-producer',
      brokers: config.brokers,
    });
    this.batchSize = config.batchSize ?? BATCH_SIZE;
    this.batchDelayMs = config.batchDelayMs ?? BATCH_DELAY_MS;
    this.logger = config.logger;
  }

  async connect(): Promise<void> {
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.logger.info('Kafka producer connected');
  }

  async disconnect(): Promise<void> {
    await this.flush();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
      this.logger.info('Kafka producer disconnected');
    }
  }

  async send(transaction: Transaction): Promise<void> {
    const key = transaction.accountId;
    const value = JSON.stringify(transaction.toJSON());
    this.pending.push({ key, value });
    if (this.pending.length >= this.batchSize) {
      await this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush().catch((err) =>
          this.logger.error({ err }, 'Batch flush error')
        );
      }, this.batchDelayMs);
    }
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0 || !this.producer) return;

    const messages = this.pending.splice(0, this.pending.length);
    const record: ProducerRecord = {
      topic: TOPIC_PENDING,
      compression: CompressionTypes.GZIP,
      messages: messages.map((m) => ({ key: m.key, value: m.value })),
    };

    await this.producer.send(record);
    this.logger.debug({ count: messages.length }, 'Batch sent');

    if (this.pending.length > 0 && !this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush().catch((err) =>
          this.logger.error({ err }, 'Scheduled batch flush error')
        );
      }, this.batchDelayMs);
    }
  }

  async sendBatch(transactions: Transaction[]): Promise<void> {
    if (!this.producer) throw new Error('Producer not connected');

    const messages = transactions.map((t) => ({
      key: t.accountId,
      value: JSON.stringify(t.toJSON()),
    }));

    const record: ProducerRecord = {
      topic: TOPIC_PENDING,
      compression: CompressionTypes.GZIP,
      messages,
    };

    await this.producer.send(record);
    this.logger.debug({ count: messages.length }, 'Batch sent');
  }
}

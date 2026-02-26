import { Kafka, type Consumer, type EachMessagePayload } from 'kafkajs';
import type { Logger } from '@transaction-auth-engine/shared';
import type { TransactionPayload } from '@transaction-auth-engine/core';
import { WebhookDispatcher } from './webhook-dispatcher.js';

const TOPIC_AUTHORIZED = 'transactions.authorized';

export interface NotifierConsumerConfig {
  brokers: string[];
  groupId: string;
  webhookBaseUrl: string;
  logger: Logger;
}

export class NotifierConsumer {
  private readonly kafka: Kafka;
  private readonly groupId: string;
  private consumer: Consumer | null = null;
  private readonly logger: Logger;
  private readonly dispatcher: WebhookDispatcher;

  constructor(config: NotifierConsumerConfig) {
    this.kafka = new Kafka({
      clientId: 'notifier-consumer',
      brokers: config.brokers,
    });
    this.groupId = config.groupId;
    this.logger = config.logger;
    this.dispatcher = new WebhookDispatcher({
      webhookBaseUrl: config.webhookBaseUrl,
      logger: config.logger,
    });
  }

  async connect(): Promise<void> {
    this.consumer = this.kafka.consumer({ groupId: this.groupId });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPIC_AUTHORIZED, fromBeginning: false });
    this.logger.info('Notifier consumer connected');
  }

  async disconnect(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
    this.logger.info('Notifier consumer disconnected');
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
    const { message } = payload;
    const value = message.value?.toString();
    if (!value) {
      this.logger.warn({ offset: message.offset }, 'Empty message, skipping');
      return;
    }

    let parsed: TransactionPayload;
    try {
      parsed = JSON.parse(value) as TransactionPayload;
    } catch (err) {
      this.logger.error({ err, offset: message.offset }, 'Invalid message');
      return;
    }

    try {
      await this.dispatcher.notify(parsed);
    } catch (err) {
      this.logger.error(
        { err, transactionId: parsed.id, merchantId: parsed.merchantId },
        'Webhook notify failed (message will be redelivered or go to DLQ if retries exhausted)'
      );
      throw err;
    }
  }
}

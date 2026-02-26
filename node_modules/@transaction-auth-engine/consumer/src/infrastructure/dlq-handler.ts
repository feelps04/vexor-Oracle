import type { Kafka } from 'kafkajs';
import type { Logger } from '@transaction-auth-engine/shared';

const DLQ_TOPIC = 'transactions.dlq';
const HEADER_REASON = 'x-dlq-reason';
const HEADER_RETRY_COUNT = 'x-dlq-retry-count';
const HEADER_TIMESTAMP = 'x-dlq-timestamp';

export interface DLQMessage {
  originalPayload: unknown;
  reason: string;
  retryCount: number;
}

export class DLQHandler {
  private producer: Awaited<ReturnType<Kafka['producer']>> | null = null;

  constructor(
    private readonly kafka: Kafka,
    private readonly logger: Logger
  ) {}

  async connect(): Promise<void> {
    this.producer = this.kafka.producer();
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }

  async send(message: DLQMessage): Promise<void> {
    if (!this.producer) throw new Error('DLQ producer not connected');

    const value = JSON.stringify(message.originalPayload);
    await this.producer.send({
      topic: DLQ_TOPIC,
      messages: [
        {
          value,
          headers: {
            [HEADER_REASON]: message.reason,
            [HEADER_RETRY_COUNT]: String(message.retryCount),
            [HEADER_TIMESTAMP]: new Date().toISOString(),
          },
        },
      ],
    });

    this.logger.warn(
      {
        reason: message.reason,
        retryCount: message.retryCount,
      },
      'Message sent to DLQ'
    );
  }
}

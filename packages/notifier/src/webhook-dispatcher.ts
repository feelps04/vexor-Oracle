import axios, { type AxiosError } from 'axios';
import type { Logger } from '@transaction-auth-engine/shared';
import type { TransactionPayload } from '@transaction-auth-engine/core';

const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRIES = 5;

export interface WebhookDispatcherConfig {
  /** Base URL or map merchantId -> webhook URL. If string, all merchants use this URL with ?merchantId= */
  webhookBaseUrl: string;
  logger: Logger;
  /** Backoff delays in ms: [1000, 2000, 4000] */
  backoffMs?: number[];
  maxRetries?: number;
}

export class WebhookDispatcher {
  private readonly webhookBaseUrl: string;
  private readonly logger: Logger;
  private readonly backoffMs: number[];
  private readonly maxRetries: number;

  constructor(config: WebhookDispatcherConfig) {
    this.webhookBaseUrl = config.webhookBaseUrl.replace(/\/$/, '');
    this.logger = config.logger;
    this.backoffMs = config.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.maxRetries = config.maxRetries ?? MAX_RETRIES;
  }

  async notify(transaction: TransactionPayload): Promise<void> {
    const url = this.buildUrl(transaction.merchantId);
    const payload = {
      event: 'transaction.authorized',
      transaction: {
        id: transaction.id,
        idempotencyKey: transaction.idempotencyKey,
        correlationId: transaction.correlationId ?? transaction.idempotencyKey,
        accountId: transaction.accountId,
        amount: transaction.amount,
        currency: transaction.currency,
        merchantId: transaction.merchantId,
        status: transaction.status,
      },
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await axios.post(url, payload, {
          timeout: 10_000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: (status) => status >= 200 && status < 300,
        });
        this.logger.info(
          { merchantId: transaction.merchantId, transactionId: transaction.id, attempt: attempt + 1 },
          'Webhook delivered'
        );
        return;
      } catch (err) {
        lastError = err as Error;
        const status = (err as AxiosError).response?.status;
        const delay = this.backoffMs[Math.min(attempt, this.backoffMs.length - 1)];

        this.logger.warn(
          {
            merchantId: transaction.merchantId,
            transactionId: transaction.id,
            attempt: attempt + 1,
            status,
            nextRetryMs: attempt < this.maxRetries ? delay : undefined,
          },
          'Webhook delivery failed'
        );

        if (attempt < this.maxRetries) {
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(
      { merchantId: transaction.merchantId, transactionId: transaction.id, err: lastError },
      'Webhook delivery failed after retries'
    );
    throw lastError ?? new Error('Webhook failed');
  }

  private buildUrl(merchantId: string): string {
    const separator = this.webhookBaseUrl.includes('?') ? '&' : '?';
    return `${this.webhookBaseUrl}${separator}merchantId=${encodeURIComponent(merchantId)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

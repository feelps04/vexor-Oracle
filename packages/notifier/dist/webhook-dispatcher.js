"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookDispatcher = void 0;
const axios_1 = __importDefault(require("axios"));
const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRIES = 5;
class WebhookDispatcher {
    webhookBaseUrl;
    logger;
    backoffMs;
    maxRetries;
    constructor(config) {
        this.webhookBaseUrl = config.webhookBaseUrl.replace(/\/$/, '');
        this.logger = config.logger;
        this.backoffMs = config.backoffMs ?? DEFAULT_BACKOFF_MS;
        this.maxRetries = config.maxRetries ?? MAX_RETRIES;
    }
    async notify(transaction) {
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
        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                await axios_1.default.post(url, payload, {
                    timeout: 10_000,
                    headers: { 'Content-Type': 'application/json' },
                    validateStatus: (status) => status >= 200 && status < 300,
                });
                this.logger.info({ merchantId: transaction.merchantId, transactionId: transaction.id, attempt: attempt + 1 }, 'Webhook delivered');
                return;
            }
            catch (err) {
                lastError = err;
                const status = err.response?.status;
                const delay = this.backoffMs[Math.min(attempt, this.backoffMs.length - 1)];
                this.logger.warn({
                    merchantId: transaction.merchantId,
                    transactionId: transaction.id,
                    attempt: attempt + 1,
                    status,
                    nextRetryMs: attempt < this.maxRetries ? delay : undefined,
                }, 'Webhook delivery failed');
                if (attempt < this.maxRetries) {
                    await this.sleep(delay);
                }
            }
        }
        this.logger.error({ merchantId: transaction.merchantId, transactionId: transaction.id, err: lastError }, 'Webhook delivery failed after retries');
        throw lastError ?? new Error('Webhook failed');
    }
    buildUrl(merchantId) {
        const separator = this.webhookBaseUrl.includes('?') ? '&' : '?';
        return `${this.webhookBaseUrl}${separator}merchantId=${encodeURIComponent(merchantId)}`;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.WebhookDispatcher = WebhookDispatcher;

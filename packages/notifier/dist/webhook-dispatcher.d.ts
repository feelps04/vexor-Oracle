import type { Logger } from '@transaction-auth-engine/shared';
import type { TransactionPayload } from '@transaction-auth-engine/core';
export interface WebhookDispatcherConfig {
    /** Base URL or map merchantId -> webhook URL. If string, all merchants use this URL with ?merchantId= */
    webhookBaseUrl: string;
    logger: Logger;
    /** Backoff delays in ms: [1000, 2000, 4000] */
    backoffMs?: number[];
    maxRetries?: number;
}
export declare class WebhookDispatcher {
    private readonly webhookBaseUrl;
    private readonly logger;
    private readonly backoffMs;
    private readonly maxRetries;
    constructor(config: WebhookDispatcherConfig);
    notify(transaction: TransactionPayload): Promise<void>;
    private buildUrl;
    private sleep;
}
//# sourceMappingURL=webhook-dispatcher.d.ts.map
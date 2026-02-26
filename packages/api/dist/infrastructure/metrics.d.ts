import { Counter, Histogram, Gauge } from 'prom-client';
import type { FastifyInstance } from 'fastify';
export declare const httpRequestsTotal: Counter<"method" | "status" | "route">;
export declare const httpRequestDuration: Histogram<"method" | "route">;
export declare const transactionsAuthorizedTotal: Counter<"currency">;
export declare const transactionsDeniedTotal: Counter<"reason">;
export declare const transactionsDlqTotal: Counter<string>;
export declare const kafkaConsumerLag: Gauge<"topic" | "partition">;
export declare const redisOperationsTotal: Counter<"status" | "operation">;
export declare const activeWebSockets: Gauge<"endpoint">;
export declare function registerMetrics(app: FastifyInstance): Promise<void>;
//# sourceMappingURL=metrics.d.ts.map
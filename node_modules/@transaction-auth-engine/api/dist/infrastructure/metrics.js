"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeWebSockets = exports.redisOperationsTotal = exports.kafkaConsumerLag = exports.transactionsDlqTotal = exports.transactionsDeniedTotal = exports.transactionsAuthorizedTotal = exports.httpRequestDuration = exports.httpRequestsTotal = void 0;
exports.registerMetrics = registerMetrics;
const prom_client_1 = require("prom-client");
// Enable default metrics (memory, CPU, event loop, etc.)
(0, prom_client_1.collectDefaultMetrics)();
// Custom metrics
exports.httpRequestsTotal = new prom_client_1.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
});
exports.httpRequestDuration = new prom_client_1.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
exports.transactionsAuthorizedTotal = new prom_client_1.Counter({
    name: 'transactions_authorized_total',
    help: 'Total number of authorized transactions',
    labelNames: ['currency'],
});
exports.transactionsDeniedTotal = new prom_client_1.Counter({
    name: 'transactions_denied_total',
    help: 'Total number of denied transactions',
    labelNames: ['reason'],
});
exports.transactionsDlqTotal = new prom_client_1.Counter({
    name: 'transactions_dlq_total',
    help: 'Total number of messages sent to DLQ',
});
exports.kafkaConsumerLag = new prom_client_1.Gauge({
    name: 'kafka_consumer_lag',
    help: 'Kafka consumer lag by topic and partition',
    labelNames: ['topic', 'partition'],
});
exports.redisOperationsTotal = new prom_client_1.Counter({
    name: 'redis_operations_total',
    help: 'Total number of Redis operations',
    labelNames: ['operation', 'status'],
});
exports.activeWebSockets = new prom_client_1.Gauge({
    name: 'active_websockets',
    help: 'Number of active WebSocket connections',
    labelNames: ['endpoint'],
});
async function registerMetrics(app) {
    app.get('/metrics', async (_req, reply) => {
        const metrics = await prom_client_1.register.metrics();
        return reply.type('text/plain').send(metrics);
    });
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.correlationIdStorage = void 0;
exports.getCorrelationId = getCorrelationId;
exports.runWithCorrelationId = runWithCorrelationId;
exports.generateCorrelationId = generateCorrelationId;
exports.initTracing = initTracing;
const sdk_node_1 = require("@opentelemetry/sdk-node");
const auto_instrumentations_node_1 = require("@opentelemetry/auto-instrumentations-node");
const exporter_jaeger_1 = require("@opentelemetry/exporter-jaeger");
const resources_1 = require("@opentelemetry/resources");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const async_hooks_1 = require("async_hooks");
// Correlation ID storage
const correlationIdStorage = new async_hooks_1.AsyncLocalStorage();
exports.correlationIdStorage = correlationIdStorage;
function getCorrelationId() {
    return correlationIdStorage.getStore();
}
function runWithCorrelationId(correlationId, fn) {
    return correlationIdStorage.run(correlationId, fn);
}
function generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
// Initialize OpenTelemetry SDK
function initTracing(serviceName) {
    const jaegerHost = process.env.JAEGER_HOST || 'jaeger';
    const jaegerPort = parseInt(process.env.JAEGER_PORT || '14268', 10);
    if (process.env.OTEL_DISABLED === 'true') {
        return null;
    }
    const sdk = new sdk_node_1.NodeSDK({
        resource: new resources_1.Resource({
            [semantic_conventions_1.SemanticResourceAttributes.SERVICE_NAME]: serviceName,
            [semantic_conventions_1.SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
        }),
        traceExporter: new exporter_jaeger_1.JaegerExporter({
            endpoint: `http://${jaegerHost}:${jaegerPort}/api/traces`,
        }),
        instrumentations: [
            (0, auto_instrumentations_node_1.getNodeAutoInstrumentations)({
                '@opentelemetry/instrumentation-fs': { enabled: false },
            }),
        ],
    });
    sdk.start();
    return sdk;
}
//# sourceMappingURL=tracing.js.map
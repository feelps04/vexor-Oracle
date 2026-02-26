"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
exports.withCorrelationId = withCorrelationId;
const pino_1 = __importDefault(require("pino"));
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
function createLogger(service, baseBindings) {
    return (0, pino_1.default)({
        level: LOG_LEVEL,
        base: { service, ...baseBindings },
        timestamp: pino_1.default.stdTimeFunctions.isoTime,
        formatters: {
            level: (label) => ({ level: label }),
        },
    });
}
/** Create a child logger with correlationId for request/transaction tracing. */
function withCorrelationId(logger, correlationId) {
    return logger.child({ correlationId });
}
//# sourceMappingURL=index.js.map
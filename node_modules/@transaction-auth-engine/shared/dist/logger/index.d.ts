import pino from 'pino';
export type Logger = pino.Logger;
export declare function createLogger(service: string, baseBindings?: {
    correlationId?: string;
}): Logger;
/** Create a child logger with correlationId for request/transaction tracing. */
export declare function withCorrelationId(logger: Logger, correlationId: string): Logger;
//# sourceMappingURL=index.d.ts.map
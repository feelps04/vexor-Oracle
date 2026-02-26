import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

export type Logger = pino.Logger;

export function createLogger(service: string, baseBindings?: { correlationId?: string }): Logger {
  return pino({
    level: LOG_LEVEL,
    base: { service, ...baseBindings },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

/** Create a child logger with correlationId for request/transaction tracing. */
export function withCorrelationId(logger: Logger, correlationId: string): Logger {
  return logger.child({ correlationId });
}

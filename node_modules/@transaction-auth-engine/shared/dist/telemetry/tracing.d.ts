import { NodeSDK } from '@opentelemetry/sdk-node';
import { AsyncLocalStorage } from 'async_hooks';
declare const correlationIdStorage: AsyncLocalStorage<string>;
export declare function getCorrelationId(): string | undefined;
export declare function runWithCorrelationId<T>(correlationId: string, fn: () => T): T;
export declare function generateCorrelationId(): string;
export declare function initTracing(serviceName: string): NodeSDK | null;
export { correlationIdStorage };
//# sourceMappingURL=tracing.d.ts.map
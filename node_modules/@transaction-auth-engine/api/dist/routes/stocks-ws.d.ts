import type { FastifyInstance } from 'fastify';
import type Redis from 'ioredis';
export interface StocksWsDeps {
    brokers: string[];
    redis?: Redis;
}
export declare function stocksWsRoutes(app: FastifyInstance, opts: {
    brokers: string;
    redis?: Redis;
}): Promise<void>;
//# sourceMappingURL=stocks-ws.d.ts.map
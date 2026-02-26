import type { FastifyInstance } from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
export interface RealtimeDeps {
    redis: Redis;
    pg: Pool;
}
export declare function realtimeRoutes(app: FastifyInstance, opts: RealtimeDeps): Promise<void>;
//# sourceMappingURL=realtime.d.ts.map
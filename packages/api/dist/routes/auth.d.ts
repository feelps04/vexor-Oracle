import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type Redis from 'ioredis';
export declare function authRoutes(app: FastifyInstance, opts: {
    pg: Pool;
    redis?: Redis;
}): Promise<void>;
//# sourceMappingURL=auth.d.ts.map
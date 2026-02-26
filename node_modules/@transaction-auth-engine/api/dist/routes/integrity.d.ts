import type { FastifyInstance } from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
export interface IntegrityDeps {
    redis: Redis;
    pg: Pool;
}
export declare function integrityRoutes(app: FastifyInstance, opts: IntegrityDeps): Promise<void>;
//# sourceMappingURL=integrity.d.ts.map
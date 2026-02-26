import type { FastifyInstance } from 'fastify';
import type Redis from 'ioredis';
import { Pool } from 'pg';
export interface BalanceOpsDeps {
    redis?: Redis;
    pg?: Pool;
}
export declare function balanceOpsRoutes(app: FastifyInstance, opts: BalanceOpsDeps): Promise<void>;
//# sourceMappingURL=balance-ops.d.ts.map
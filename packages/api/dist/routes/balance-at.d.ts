import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
export interface BalanceAtDeps {
    pg: Pool;
}
export declare function balanceAtRoutes(app: FastifyInstance, opts: BalanceAtDeps): Promise<void>;
//# sourceMappingURL=balance-at.d.ts.map
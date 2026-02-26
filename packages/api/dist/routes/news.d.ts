import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
export interface NewsDeps {
    pg: Pool;
}
export declare function newsRoutes(app: FastifyInstance, opts: NewsDeps): Promise<void>;
//# sourceMappingURL=news.d.ts.map
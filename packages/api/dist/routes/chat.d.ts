import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
export interface ChatDeps {
    pg: Pool;
}
export declare function chatRoutes(app: FastifyInstance, opts: ChatDeps): Promise<void>;
//# sourceMappingURL=chat.d.ts.map
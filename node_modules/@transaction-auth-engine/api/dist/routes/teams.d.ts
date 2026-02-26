import type { FastifyInstance } from 'fastify';
import type Redis from 'ioredis';
export interface TeamsDeps {
    redis: Redis;
}
export declare function teamsRoutes(app: FastifyInstance, opts: TeamsDeps): Promise<void>;
//# sourceMappingURL=teams.d.ts.map
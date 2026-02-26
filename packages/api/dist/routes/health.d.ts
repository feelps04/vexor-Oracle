import type { FastifyInstance } from 'fastify';
export interface HealthDeps {
    redis?: {
        ping(): Promise<string>;
    };
}
export declare function healthRoutes(app: FastifyInstance, opts: HealthDeps): Promise<void>;
//# sourceMappingURL=health.d.ts.map
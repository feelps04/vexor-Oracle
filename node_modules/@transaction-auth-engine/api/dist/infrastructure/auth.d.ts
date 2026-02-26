import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
export type AuthUser = {
    userId: string;
    email?: string;
    accountId?: string;
};
export declare function requireAuth(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null>;
//# sourceMappingURL=auth.d.ts.map
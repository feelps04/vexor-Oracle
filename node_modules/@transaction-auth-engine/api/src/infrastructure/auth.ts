import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export type AuthUser = {
  userId: string;
  email?: string;
  accountId?: string;
};

export async function requireAuth(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  const authHeader = String(request.headers.authorization ?? '');
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    reply.code(401).send({ message: 'Unauthorized' });
    return null;
  }

  try {
    const decoded = app.jwt.verify(token) as { sub?: string; email?: string; accountId?: string };
    const userId = String(decoded.sub ?? '');
    if (!userId) {
      reply.code(401).send({ message: 'Unauthorized' });
      return null;
    }
    const user: AuthUser = { userId, email: decoded.email, accountId: decoded.accountId };
    (request as any).user = user;
    return user;
  } catch {
    reply.code(401).send({ message: 'Unauthorized' });
    return null;
  }
}

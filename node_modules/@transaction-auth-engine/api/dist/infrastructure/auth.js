"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
async function requireAuth(app, request, reply) {
    const authHeader = String(request.headers.authorization ?? '');
    const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
        reply.code(401).send({ message: 'Unauthorized' });
        return null;
    }
    try {
        const decoded = app.jwt.verify(token);
        const userId = String(decoded.sub ?? '');
        if (!userId) {
            reply.code(401).send({ message: 'Unauthorized' });
            return null;
        }
        const user = { userId, email: decoded.email, accountId: decoded.accountId };
        request.user = user;
        return user;
    }
    catch {
        reply.code(401).send({ message: 'Unauthorized' });
        return null;
    }
}
//# sourceMappingURL=auth.js.map
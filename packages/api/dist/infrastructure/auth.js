"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const supabase_jwt_js_1 = require("./supabase-jwt.js");
async function requireAuth(app, request, reply) {
    const authHeader = String(request.headers.authorization ?? '');
    const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
        reply.code(401).send({ message: 'Unauthorized' });
        return null;
    }
    try {
        // Try Supabase JWT verification first (ES256)
        const supabasePayload = (0, supabase_jwt_js_1.verifySupabaseJWT)(token);
        if (supabasePayload) {
            const userId = String(supabasePayload.sub ?? '');
            if (!userId) {
                reply.code(401).send({ message: 'Unauthorized' });
                return null;
            }
            const user = {
                userId,
                email: supabasePayload.email,
                accountId: supabasePayload.app_metadata?.accountId
            };
            request.user = user;
            return user;
        }
        // Fallback to @fastify/jwt (HS256) for backward compatibility
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

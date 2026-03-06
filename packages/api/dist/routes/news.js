"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newsRoutes = newsRoutes;
async function newsRoutes(app) {
    app.get('/api/v1/news', async (_req, reply) => {
        return reply.status(200).send({ items: [] });
    });
}

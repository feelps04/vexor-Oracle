"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newsRoutes = newsRoutes;
const auth_js_1 = require("../infrastructure/auth.js");
async function newsRoutes(app, opts) {
    const { pg } = opts;
    app.get('/api/v1/news', async (request, reply) => {
        const user = await (0, auth_js_1.requireAuth)(app, request, reply);
        if (!user)
            return;
        const res = await pg.query(`SELECT id, source, external_id, title, url, published_at, summary
         FROM news_articles
         ORDER BY published_at DESC
         LIMIT 50`);
        return reply.send({ articles: res.rows });
    });
    app.post('/api/v1/news/refresh', async (request, reply) => {
        const user = await (0, auth_js_1.requireAuth)(app, request, reply);
        if (!user)
            return;
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
            return reply.code(501).send({ message: 'NEWS_API_KEY não configurada' });
        }
        // Minimal implementation: fetch from NewsAPI (top-headlines business) and upsert.
        // Provider can be swapped later.
        const url = `https://newsapi.org/v2/top-headlines?category=business&language=pt&pageSize=20`;
        const fetchRes = await fetch(url, {
            headers: { 'X-Api-Key': apiKey },
        });
        if (!fetchRes.ok) {
            const text = await fetchRes.text().catch(() => '');
            return reply.code(502).send({ message: 'Falha ao buscar notícias', status: fetchRes.status, body: text.slice(0, 500) });
        }
        const data = (await fetchRes.json().catch(() => null));
        const articles = Array.isArray(data?.articles) ? data.articles : [];
        let inserted = 0;
        for (const a of articles) {
            const title = String(a?.title ?? '').trim();
            const articleUrl = String(a?.url ?? '').trim();
            const publishedAt = String(a?.publishedAt ?? '').trim();
            if (!title || !articleUrl || !publishedAt)
                continue;
            const externalId = String(a?.url ?? '').slice(0, 250);
            const summary = a?.description ? String(a.description).slice(0, 500) : null;
            await pg.query(`INSERT INTO news_articles(source, external_id, title, url, published_at, summary, raw_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (source, external_id) DO UPDATE SET
             title = EXCLUDED.title,
             url = EXCLUDED.url,
             published_at = EXCLUDED.published_at,
             summary = EXCLUDED.summary,
             raw_json = EXCLUDED.raw_json`, ['newsapi', externalId, title, articleUrl, publishedAt, summary, JSON.stringify(a)]);
            inserted++;
        }
        return reply.send({ inserted });
    });
}
//# sourceMappingURL=news.js.map
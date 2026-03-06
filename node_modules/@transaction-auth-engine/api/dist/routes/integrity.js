"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.integrityRoutes = integrityRoutes;
const BALANCE_PREFIX = 'balance:v2:';
const INITIAL_BALANCE = 0;
const DEFAULT_ACCOUNTS = ['acc-1', 'acc-2', 'acc-3'];
async function integrityRoutes(app, opts) {
    const { redis, pg } = opts;
    app.get('/api/v1/integrity', {
        schema: {
            querystring: {
                type: 'object',
                properties: { accounts: { type: 'string', description: 'Comma-separated account IDs' } },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        redis: { type: 'object', additionalProperties: { type: 'integer' } },
                        sql: { type: 'object', additionalProperties: { type: 'integer' } },
                        match: { type: 'boolean' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const accountsStr = request.query.accounts ?? DEFAULT_ACCOUNTS.join(',');
        const accounts = accountsStr.split(',').map((s) => s.trim()).filter(Boolean);
        if (accounts.length === 0) {
            return reply.status(200).send({ redis: {}, sql: {}, match: true });
        }
        const redisBalances = {};
        for (const accountId of accounts) {
            const key = `${BALANCE_PREFIX}${accountId}`;
            const val = await redis.get(key);
            redisBalances[accountId] = val !== null ? parseInt(val, 10) : INITIAL_BALANCE;
        }
        const sqlBalances = {};
        for (const accountId of accounts) {
            sqlBalances[accountId] = INITIAL_BALANCE;
        }
        try {
            const placeholders = accounts.map((_, i) => `$${i + 1}`).join(',');
            const res = await pg.query(`SELECT account_id,
                  COALESCE(SUM(
                    CASE
                      WHEN type = 'deposit' THEN amount
                      WHEN type = 'withdraw' THEN -amount
                      ELSE 0
                    END
                  ), 0)::bigint AS net_operations
           FROM balance_operations
           WHERE account_id IN (${placeholders})
           GROUP BY account_id`, accounts);
            for (const row of res.rows) {
                sqlBalances[row.account_id] = INITIAL_BALANCE + parseInt(String(row.net_operations), 10);
            }
        }
        catch {
            // ignore and keep defaults
        }
        let match = true;
        for (const accountId of accounts) {
            if (redisBalances[accountId] !== sqlBalances[accountId]) {
                match = false;
                break;
            }
        }
        return reply.status(200).send({
            redis: redisBalances,
            sql: sqlBalances,
            match,
        });
    });
}

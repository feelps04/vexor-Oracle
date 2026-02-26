"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stockRoutes = stockRoutes;
const node_dns_1 = __importDefault(require("node:dns"));
const DEFAULT_STOCKS = [
    // Financeiro e Seguros
    'B3SA3',
    'BBAS3',
    'BBDC3',
    'BBDC4',
    'BBSE3',
    'BPAC11',
    'ITUB4',
    'ITSA4',
    'SANB11',
    'TRIS3',
    // Petróleo, Gás e Biocombustíveis
    'PETR3',
    'PETR4',
    'PRIO3',
    'RECV3',
    'RRRP3',
    'UGPA3',
    'VBBR3',
    // Materiais Básicos (Mineração/Siderurgia)
    'VALE3',
    'CSNA3',
    'CMIN3',
    'GGBR4',
    'GOAU4',
    'SUZB3',
    'KLBN11',
    'UNIP6',
    // Utilidade Pública (Energia/Saneamento)
    'AXIA3',
    'CSMG3',
    'SBSP3',
    'ELET3',
    'ELET6',
    'CPFE3',
    'CMIG4',
    'EQTL3',
    'TRPL4',
    // Consumo e Varejo
    'AMER3',
    'ARZZ3',
    'BHIA3',
    'LREN3',
    'MGLU3',
    'AUAU3',
    'SOMA3',
    // Saúde
    'HAPV3',
    'RDOR3',
    'RADL3',
    'VIVT3',
    // Transporte e Logística
    'RAIL3',
    'RENT3',
    'AZUL4',
    'GOLL4',
    // Telecomunicações e Tecnologia
    'VIVT3',
    'TIMS3',
    'TOTS3',
    // Outros (Construção, Alimentos, etc.)
    'JBSS3',
    'BEEF3',
    'MRVE3',
    'CYRE3',
    'MULT3',
    'IGTI11',
];
function parseSymbolsList(raw) {
    if (!raw)
        return [];
    return String(raw)
        .split(/[\s,;]+/g)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
}
function parseJsonObject(raw) {
    if (!raw)
        return {};
    try {
        const v = JSON.parse(String(raw));
        if (!v || typeof v !== 'object')
            return {};
        const out = {};
        for (const [k, val] of Object.entries(v)) {
            const kk = String(k || '').trim().toUpperCase();
            const vv = String(val || '').trim().toUpperCase();
            if (kk && vv)
                out[kk] = vv;
        }
        return out;
    }
    catch {
        return {};
    }
}
function normalizeOneSymbol(symbol) {
    return String(symbol || '').trim().toUpperCase();
}
function normalizeSymbolKey(symbol) {
    const s = normalizeOneSymbol(symbol);
    if (!s)
        return s;
    return s.replace(/[^A-Z0-9$]/g, '');
}
function resolveAlias(symbol, aliases) {
    const s = normalizeOneSymbol(symbol);
    if (!s)
        return s;
    const k = normalizeSymbolKey(s);
    const mapped = aliases[k] || aliases[s];
    return mapped ? normalizeOneSymbol(mapped) : s;
}
function resolveFuturesSymbol(symbol, currentFuturesContracts) {
    const requested = normalizeOneSymbol(symbol);
    if (!requested)
        return { requested, resolved: requested };
    // Handle notation like WIN$ / WDO$ / IND$ / DOL$ used by traders.
    // We resolve to the current contract if available in B3_FUTURES_CURRENT_CONTRACTS.
    const root = requested.endsWith('$') ? requested.slice(0, -1) : requested;
    const mapped = currentFuturesContracts[root];
    if (mapped)
        return { requested, resolved: normalizeOneSymbol(mapped) };
    return { requested, resolved: root };
}
function buildSymbolCandidates(input, currentFuturesContracts, aliases) {
    const requested = normalizeOneSymbol(input);
    const base = resolveAlias(requested, aliases);
    const fut = resolveFuturesSymbol(base, currentFuturesContracts);
    const stripped = normalizeOneSymbol(base.replace(/[^A-Z0-9]/g, ''));
    const strippedFut = normalizeOneSymbol(fut.resolved.replace(/[^A-Z0-9]/g, ''));
    const list = [
        fut.resolved,
        base,
        requested,
        strippedFut,
        stripped,
    ]
        .map(normalizeOneSymbol)
        .filter(Boolean);
    return { requested, candidates: Array.from(new Set(list)) };
}
async function resolveIpv4Host(hostname, timeoutMs = 1000) {
    const host = String(hostname || '').trim();
    if (!host)
        return host;
    const lookupPromise = new Promise((resolve, reject) => {
        node_dns_1.default.lookup(host, { family: 4 }, (err, address) => {
            if (err || !address)
                return reject(err ?? new Error('dns lookup failed'));
            resolve(address);
        });
    });
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(host), timeoutMs);
    });
    try {
        return await Promise.race([lookupPromise, timeoutPromise]);
    }
    catch {
        return host;
    }
}
async function httpGetJson(url) {
    const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(25_000),
    });
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    }
    catch {
        json = null;
    }
    return { status: res.status, text, json };
}
async function stockRoutes(app, opts) {
    const marketDataUrl = process.env.MARKET_DATA_URL;
    const redis = opts?.redis;
    const LAST_PRICE_PREFIX = 'market:lastPrice:v1:';
    const extraSymbols = parseSymbolsList(process.env.B3_EXTRA_SYMBOLS ?? process.env.STOCKS_EXTRA_SYMBOLS);
    const currentFuturesContracts = parseJsonObject(process.env.B3_FUTURES_CURRENT_CONTRACTS ?? process.env.FUTURES_CURRENT_CONTRACTS);
    const rawAliases = parseJsonObject(process.env.MARKET_SYMBOL_ALIASES ?? process.env.SYMBOL_ALIASES);
    const symbolAliases = {};
    for (const [k, v] of Object.entries(rawAliases)) {
        const kk = normalizeSymbolKey(k);
        const vv = normalizeOneSymbol(v);
        if (kk && vv)
            symbolAliases[kk] = vv;
    }
    app.get('/api/v1/market/futures/current', {
        schema: {
            response: {
                200: {
                    type: 'object',
                    properties: {
                        contracts: { type: 'object', additionalProperties: { type: 'string' } },
                    },
                },
            },
        },
    }, async (_request, reply) => {
        return reply.status(200).send({ contracts: currentFuturesContracts });
    });
    app.get('/api/v1/market/symbols/check', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    // Comma/space separated list.
                    symbols: { type: 'string' },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    requested: { type: 'string' },
                                    symbol: { type: 'string' },
                                    status: { type: 'string' },
                                    priceBRL: { type: 'number' },
                                    message: { type: 'string' },
                                },
                                required: ['requested', 'symbol', 'status'],
                            },
                        },
                    },
                    required: ['items'],
                },
            },
        },
    }, async (request, reply) => {
        const rawList = parseSymbolsList(request.query.symbols);
        const unique = Array.from(new Set(rawList)).slice(0, 200);
        // If the user did not pass any symbol, default to current futures roots + configured extras.
        const defaults = unique.length
            ? unique
            : Array.from(new Set([...Object.keys(currentFuturesContracts), ...extraSymbols])).slice(0, 200);
        if (!redis) {
            return reply.status(200).send({
                items: defaults.map((s) => {
                    const r = resolveFuturesSymbol(s, currentFuturesContracts);
                    return {
                        requested: r.requested,
                        symbol: r.resolved,
                        status: 'redis_not_configured',
                        message: 'Redis not configured (real-time feed unavailable)',
                    };
                }),
            });
        }
        const items = [];
        // Check both requested and resolved symbols (so user can pass WIN$ but also WINJ26).
        for (const s of defaults) {
            const resolved = buildSymbolCandidates(s, currentFuturesContracts, symbolAliases);
            const candidates = resolved.candidates;
            let foundPrice = null;
            let foundSym = null;
            for (const c of candidates) {
                try {
                    const v = await redis.get(`${LAST_PRICE_PREFIX}${c}`);
                    const n = Number(v);
                    if (Number.isFinite(n) && n > 0) {
                        foundPrice = n;
                        foundSym = c;
                        break;
                    }
                }
                catch {
                    // ignore
                }
            }
            if (foundPrice != null && foundSym) {
                items.push({ requested: resolved.requested, symbol: foundSym, status: 'ok', priceBRL: foundPrice });
            }
            else {
                items.push({
                    requested: resolved.requested,
                    symbol: candidates[0] ?? resolved.requested,
                    status: 'no_data',
                    message: 'no real-time price yet for symbol',
                });
            }
        }
        return reply.status(200).send({ items });
    });
    app.get('/api/v1/stocks', {
        schema: {
            response: {
                200: {
                    type: 'object',
                    properties: {
                        symbols: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
        },
    }, async (_request, reply) => {
        if (!redis) {
            const out = Array.from(new Set([...DEFAULT_STOCKS, ...extraSymbols])).sort();
            return reply.status(200).send({ symbols: out });
        }
        try {
            const symbols = new Set([...DEFAULT_STOCKS, ...extraSymbols]);
            let cursor = '0';
            do {
                const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${LAST_PRICE_PREFIX}*`, 'COUNT', '1000');
                cursor = nextCursor;
                for (const k of keys) {
                    if (!k.startsWith(LAST_PRICE_PREFIX))
                        continue;
                    const sym = k.slice(LAST_PRICE_PREFIX.length).trim();
                    if (sym)
                        symbols.add(sym.toUpperCase());
                }
            } while (cursor !== '0');
            const out = Array.from(symbols).sort();
            return reply.status(200).send({ symbols: out });
        }
        catch {
            return reply.status(200).send({ symbols: DEFAULT_STOCKS });
        }
    });
    app.get('/api/v1/stocks/:symbol/history', {
        schema: {
            params: {
                type: 'object',
                properties: { symbol: { type: 'string' } },
                required: ['symbol'],
            },
            querystring: {
                type: 'object',
                properties: {
                    range: { type: 'string' },
                    interval: { type: 'string' },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        symbol: { type: 'string' },
                        range: { type: 'string' },
                        interval: { type: 'string' },
                        candles: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    time: { type: 'integer' },
                                    open: { type: 'number' },
                                    high: { type: 'number' },
                                    low: { type: 'number' },
                                    close: { type: 'number' },
                                    volume: { type: 'number' },
                                },
                            },
                        },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const symbol = request.params.symbol.toUpperCase();
        const range = request.query.range ?? '1mo';
        const interval = request.query.interval ?? '1d';
        try {
            if (!marketDataUrl) {
                return reply.status(503).send({ message: 'market-data not configured (MARKET_DATA_URL is not set)' });
            }
            const url = `${marketDataUrl}/stocks/${encodeURIComponent(symbol)}/history?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
            const out = await httpGetJson(url);
            if (out.status >= 200 && out.status < 300) {
                return reply.status(200).send(out.json);
            }
            return reply.status(503).send({ message: `market-data stocks history failed: ${out.status} ${out.text}` });
        }
        catch (err) {
            const baseMsg = err instanceof Error ? err.message : String(err);
            const cause = err instanceof Error ? err.cause : undefined;
            const causeMsg = cause && typeof cause === 'object'
                ? `${String(cause.code ?? '')}${cause.message ? ` ${cause.message}` : ''}`.trim()
                : cause != null
                    ? String(cause)
                    : '';
            const msg = causeMsg ? `${baseMsg}: ${causeMsg}` : baseMsg;
            return reply.status(503).send({ message: `market-data stocks history failed: ${msg}` });
        }
    });
    app.get('/api/v1/stocks/:symbol/history+quote', {
        schema: {
            params: {
                type: 'object',
                properties: { symbol: { type: 'string' } },
                required: ['symbol'],
            },
            querystring: {
                type: 'object',
                properties: {
                    range: { type: 'string' },
                    interval: { type: 'string' },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        symbol: { type: 'string' },
                        range: { type: 'string' },
                        interval: { type: 'string' },
                        candles: { type: 'array', items: { type: 'object' } },
                        quote: {
                            type: 'object',
                            properties: {
                                symbol: { type: 'string' },
                                priceBRL: { type: 'number' },
                            },
                            required: ['symbol', 'priceBRL'],
                        },
                    },
                    required: ['symbol', 'range', 'interval', 'candles', 'quote'],
                },
                503: {
                    type: 'object',
                    properties: { message: { type: 'string' } },
                },
            },
        },
    }, async (request, reply) => {
        const symbol = request.params.symbol.toUpperCase();
        const range = request.query.range ?? '1mo';
        const interval = request.query.interval ?? '1d';
        try {
            if (redis) {
                const v = await redis.get(`${LAST_PRICE_PREFIX}${symbol}`);
                const priceBRL = Number(v);
                if (Number.isFinite(priceBRL) && priceBRL > 0) {
                    return reply.status(200).send({
                        symbol,
                        range,
                        interval,
                        candles: [],
                        quote: { symbol, priceBRL },
                    });
                }
                return reply.status(503).send({ message: 'stocks history+quote failed: no real-time price yet for symbol' });
            }
            if (!marketDataUrl) {
                return reply.status(503).send({ message: 'market-data not configured (MARKET_DATA_URL is not set)' });
            }
            const historyUrl = `${marketDataUrl}/stocks/${encodeURIComponent(symbol)}/history?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
            const quoteUrl = `${marketDataUrl}/stocks/${encodeURIComponent(symbol)}/quote`;
            const [h, q] = await Promise.all([httpGetJson(historyUrl), httpGetJson(quoteUrl)]);
            if (h.status < 200 || h.status >= 300) {
                return reply.status(503).send({ message: `market-data stocks history failed: ${h.status} ${h.text}` });
            }
            if (q.status < 200 || q.status >= 300) {
                return reply.status(503).send({ message: `market-data stocks quote failed: ${q.status} ${q.text}` });
            }
            return reply.status(200).send({
                ...h.json,
                quote: q.json,
            });
        }
        catch (err) {
            const baseMsg = err instanceof Error ? err.message : String(err);
            const cause = err instanceof Error ? err.cause : undefined;
            const causeMsg = cause && typeof cause === 'object'
                ? `${String(cause.code ?? '')}${cause.message ? ` ${cause.message}` : ''}`.trim()
                : cause != null
                    ? String(cause)
                    : '';
            const msg = causeMsg ? `${baseMsg}: ${causeMsg}` : baseMsg;
            return reply.status(503).send({ message: `market-data stocks history+quote failed: ${msg}` });
        }
    });
    app.get('/api/v1/stocks/:symbol/quote', {
        schema: {
            params: {
                type: 'object',
                properties: { symbol: { type: 'string' } },
                required: ['symbol'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        symbol: { type: 'string' },
                        priceBRL: { type: 'number' },
                    },
                    required: ['symbol', 'priceBRL'],
                },
                503: {
                    type: 'object',
                    properties: { message: { type: 'string' } },
                },
            },
        },
    }, async (request, reply) => {
        const symbolIn = request.params.symbol.toUpperCase();
        if (!redis) {
            return reply.status(503).send({ message: 'stocks quote failed: Redis not configured (real-time feed unavailable)' });
        }
        try {
            const resolved = buildSymbolCandidates(symbolIn, currentFuturesContracts, symbolAliases);
            for (const sym of resolved.candidates) {
                const v = await redis.get(`${LAST_PRICE_PREFIX}${sym}`);
                const priceBRL = Number(v);
                if (Number.isFinite(priceBRL) && priceBRL > 0) {
                    return reply.status(200).send({ symbol: sym, priceBRL });
                }
            }
            return reply.status(503).send({ message: 'stocks quote failed: no real-time price yet for symbol' });
        }
        catch (err) {
            const baseMsg = err instanceof Error ? err.message : String(err);
            return reply.status(503).send({ message: `stocks quote failed: Redis error: ${baseMsg}` });
        }
    });
}
//# sourceMappingURL=stocks.js.map
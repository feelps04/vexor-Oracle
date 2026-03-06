"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sectorRoutes = sectorRoutes;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const auth_js_1 = require("../infrastructure/auth.js");
function normalizeId(input) {
    return String(input || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
}
function safeReadUtf8(p) {
    const buf = node_fs_1.default.readFileSync(p);
    let s = buf.toString('utf8');
    if (s.charCodeAt(0) === 0xfeff)
        s = s.slice(1);
    return s;
}
function getSectorMetaFromRow(sector) {
    const fallback = {
        source: 'MT5 Genial',
        protocol: 'Script MMF',
        frequency: 'Ticks (Real-time)',
        recommendation: 'Mudar para Poll (1-5 min). Ticks alimentam a ansiedade e o vício em "olhar o preço" a cada segundo.',
    };
    if (!sector)
        return fallback;
    const source = String(sector.source ?? '').trim();
    const protocol = String(sector.protocol ?? '').trim();
    const frequency = String(sector.frequency ?? '').trim();
    const recommendation = String(sector.recommendation ?? '').trim();
    return {
        source: source || fallback.source,
        protocol: protocol || fallback.protocol,
        frequency: frequency || fallback.frequency,
        recommendation: recommendation || fallback.recommendation,
    };
}
function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            const next = i + 1 < line.length ? line[i + 1] : '';
            if (inQuotes && next === '"') {
                cur += '"';
                i++;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }
        if (ch === ',' && !inQuotes) {
            out.push(cur);
            cur = '';
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out.map((v) => String(v ?? '').trim());
}
function parseCsvFile(p) {
    const raw = safeReadUtf8(p);
    const lines = raw
        .split(/\r?\n/g)
        .map((l) => String(l || '').trim())
        .filter(Boolean);
    if (lines.length === 0)
        return [];
    const header = parseCsvLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const parts = parseCsvLine(lines[i]);
        if (parts.length === 0)
            continue;
        const row = {};
        for (let j = 0; j < header.length; j++) {
            const k = String(header[j] ?? '').trim();
            if (!k)
                continue;
            row[k] = String(parts[j] ?? '').trim();
        }
        rows.push(row);
    }
    return rows;
}
function defaultRootCandidates() {
    const cwd = process.cwd();
    return [cwd, node_path_1.default.join(cwd, '..'), node_path_1.default.join(cwd, '..', '..'), node_path_1.default.join(cwd, '..', '..', '..')];
}
function resolveDataFile(fileName) {
    const dataDirRaw = String(process.env.DATA_DIR ?? '').trim();
    const cwd = process.cwd();
    const roots = defaultRootCandidates();
    const candidates = [];
    if (dataDirRaw) {
        if (node_path_1.default.isAbsolute(dataDirRaw)) {
            candidates.push(dataDirRaw);
        }
        else {
            for (const root of roots) {
                candidates.push(node_path_1.default.join(root, dataDirRaw));
            }
        }
    }
    for (const root of roots) {
        candidates.push(node_path_1.default.join(root, 'packages', 'api', 'data'));
        candidates.push(node_path_1.default.join(root, 'data'));
        candidates.push(root);
    }
    for (const dir of candidates) {
        try {
            const p = node_path_1.default.join(dir, fileName);
            if (node_fs_1.default.existsSync(p))
                return p;
        }
        catch {
        }
    }
    return node_path_1.default.join(cwd, fileName);
}
function findFirstExisting(relOrAbsPath) {
    const p = String(relOrAbsPath || '').trim();
    if (!p)
        return p;
    if (node_path_1.default.isAbsolute(p))
        return p;
    for (const root of defaultRootCandidates()) {
        const cand = node_path_1.default.join(root, p);
        try {
            if (node_fs_1.default.existsSync(cand))
                return cand;
        }
        catch {
        }
    }
    return node_path_1.default.join(process.cwd(), p);
}
function loadIndex(sectorsFilePath, symbolsFilePath) {
    const sectorsSt = node_fs_1.default.statSync(sectorsFilePath);
    const symbolsSt = node_fs_1.default.statSync(symbolsFilePath);
    const sectorsRows = parseCsvFile(sectorsFilePath);
    const symbolsRows = parseCsvFile(symbolsFilePath);
    const sectors = sectorsRows
        .map((r) => ({
        sector_id: normalizeId(r.sector_id),
        sector_name: String(r.sector_name || '').trim(),
        total_symbols: r.total_symbols ? Number(r.total_symbols) : undefined,
        description: r.description ? String(r.description).trim() : undefined,
        source: r.source ? String(r.source).trim() : undefined,
        protocol: r.protocol ? String(r.protocol).trim() : undefined,
        frequency: r.frequency ? String(r.frequency).trim() : undefined,
        recommendation: r.recommendation ? String(r.recommendation).trim() : undefined,
    }))
        .filter((s) => s.sector_id && s.sector_name);
    const symbolWarnings = [];
    const isValidSymbol = (sym) => /^[A-Z0-9_\-\.\^]+$/.test(sym);
    const symbols = symbolsRows
        .map((r) => ({
        sector_id: normalizeId(r.sector_id),
        sector_name: String(r.sector_name || '').trim(),
        exchange: String(r.exchange || '').trim().toUpperCase(),
        symbol: String(r.symbol || '').trim().toUpperCase(),
        description: r.description ? String(r.description).trim() : undefined,
        type: r.type ? String(r.type).trim() : undefined,
        full_symbol: r.full_symbol ? String(r.full_symbol).trim() : undefined,
    }))
        .filter((s) => {
        if (!(s.sector_id && s.exchange && s.symbol))
            return false;
        if (!isValidSymbol(s.symbol)) {
            symbolWarnings.push(`invalid symbol '${s.symbol}' in sector '${s.sector_id}'`);
            return false;
        }
        return true;
    });
    const symbolsBySectorId = {};
    for (const sym of symbols) {
        const key = sym.sector_id;
        if (!symbolsBySectorId[key])
            symbolsBySectorId[key] = [];
        symbolsBySectorId[key].push(sym);
    }
    for (const [k, list] of Object.entries(symbolsBySectorId)) {
        const unique = new Map();
        for (const item of list) {
            const key = `${item.exchange}:${item.symbol}`;
            if (unique.has(key)) {
                symbolWarnings.push(`duplicate symbol '${key}' in sector '${k}'`);
            }
            unique.set(key, item);
        }
        symbolsBySectorId[k] = Array.from(unique.values()).sort((a, b) => `${a.exchange}:${a.symbol}`.localeCompare(`${b.exchange}:${b.symbol}`));
    }
    const byId = new Map(sectors.map((s) => [s.sector_id, s]));
    const sectorIdsFromSymbols = Object.keys(symbolsBySectorId);
    for (const id of sectorIdsFromSymbols) {
        if (!byId.has(id)) {
            byId.set(id, { sector_id: id, sector_name: id });
        }
    }
    const sectorsAll = Array.from(byId.values()).sort((a, b) => a.sector_id.localeCompare(b.sector_id));
    const sectorsById = {};
    for (const s of sectorsAll) {
        sectorsById[s.sector_id] = s;
    }
    if (symbolWarnings.length > 0) {
        const msg = symbolWarnings.slice(0, 30).join('; ');
        console.warn(`[sectors] CSV warnings: ${msg}${symbolWarnings.length > 30 ? ` (+${symbolWarnings.length - 30} more)` : ''}`);
    }
    return {
        loadedAtMs: Date.now(),
        sectorsFilePath,
        sectorsFileMtimeMs: sectorsSt.mtimeMs,
        symbolsFilePath,
        symbolsFileMtimeMs: symbolsSt.mtimeMs,
        sectors: sectorsAll,
        sectorsById,
        symbolsBySectorId,
    };
}
class CircuitBreaker {
    name;
    failureThreshold;
    openDurationMs;
    state = 'CLOSED';
    failures = 0;
    openedAtMs = 0;
    halfOpenInFlight = false;
    lastError = null;
    constructor(name, failureThreshold, openDurationMs) {
        this.name = name;
        this.failureThreshold = failureThreshold;
        this.openDurationMs = openDurationMs;
    }
    snapshot() {
        return { name: this.name, state: this.state, failures: this.failures, openedAtMs: this.openedAtMs, lastError: this.lastError };
    }
    canRequest() {
        if (this.state === 'CLOSED')
            return true;
        const now = Date.now();
        if (this.state === 'OPEN') {
            if (now - this.openedAtMs >= this.openDurationMs) {
                this.state = 'HALF_OPEN';
                this.halfOpenInFlight = false;
                return true;
            }
            return false;
        }
        // HALF_OPEN
        if (this.halfOpenInFlight)
            return false;
        this.halfOpenInFlight = true;
        return true;
    }
    onSuccess() {
        this.failures = 0;
        this.lastError = null;
        this.state = 'CLOSED';
        this.openedAtMs = 0;
        this.halfOpenInFlight = false;
    }
    onFailure(err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.lastError = msg;
        this.failures++;
        this.halfOpenInFlight = false;
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.openedAtMs = Date.now();
        }
    }
}
async function sectorRoutes(app, opts) {
    const redis = opts?.redis;
    const marketDataUrl = process.env.MARKET_DATA_URL;
    const CACHE_TTL_MS = Number(process.env.SECTORS_CACHE_TTL_MS ?? 10_000);
    const BCB_TTL_MS = Number(process.env.BCB_CACHE_TTL_MS ?? 300_000); // 5 min for BCB rates
    const LAST_PRICE_PREFIX = 'market:lastPrice:v1:';
    const LAST_PRICE_TTL_SECONDS = Number(process.env.STOCKS_LAST_PRICE_TTL_SECONDS ?? 86_400);
    const INGEST_TOKEN = String(process.env.MARKET_INGEST_TOKEN ?? '').trim();
    const INGEST_STALE_MS = Number(process.env.MARKET_INGEST_STALE_MS ?? 10_000);
    const BINANCE_TTL_MS = Number(process.env.SECTORS_BINANCE_TTL_MS ?? 3_000);
    const RATE_LIMIT_WINDOW_MS = Number(process.env.MARKET_RATE_LIMIT_WINDOW_MS ?? 10_000);
    const RATE_LIMIT_MAX = Number(process.env.MARKET_RATE_LIMIT_MAX ?? 60);
    const cbFailureThreshold = Number(process.env.MARKET_CB_FAILURE_THRESHOLD ?? 3);
    const cbOpenMs = Number(process.env.MARKET_CB_OPEN_MS ?? 30_000);
    const binancePreHandler = async (req, reply) => {
        const ok = rateLimitCheck(String(req.ip ?? req.headers['x-forwarded-for'] ?? ''));
        if (!ok) {
            reply.code(429).send({ message: 'rate_limited' });
            return;
        }
    };
    const breakerBinance = new CircuitBreaker('binance', cbFailureThreshold, cbOpenMs);
    const breakerBcb = new CircuitBreaker('bcb', cbFailureThreshold, cbOpenMs);
    const rateBuckets = new Map();
    const rateLimitCheck = (key) => {
        const now = Date.now();
        const k = String(key || '').trim() || 'unknown';
        const cur = rateBuckets.get(k);
        if (!cur || now >= cur.resetAtMs) {
            rateBuckets.set(k, { resetAtMs: now + RATE_LIMIT_WINDOW_MS, count: 1 });
            return true;
        }
        if (cur.count >= RATE_LIMIT_MAX)
            return false;
        cur.count++;
        return true;
    };
    const marketPreHandler = async (req, reply) => {
        const ok = rateLimitCheck(String(req.ip ?? req.headers['x-forwarded-for'] ?? ''));
        if (!ok) {
            reply.code(429).send({ message: 'rate_limited' });
            return;
        }
        const jwtVerify = app?.jwt?.verify;
        if (typeof jwtVerify !== 'function') {
            return;
        }
        const user = await (0, auth_js_1.requireAuth)(app, req, reply);
        if (!user)
            return;
    };
    const inMemoryQuoteCache = new Map();
    const getCached = (key) => {
        const v = inMemoryQuoteCache.get(key);
        if (!v)
            return null;
        if (Date.now() > v.expiresAtMs) {
            inMemoryQuoteCache.delete(key);
            return null;
        }
        return { price: v.price, updatedAtMs: v.updatedAtMs, source: v.source };
    };
    const setCached = (key, price, ttlMs, source) => {
        if (!Number.isFinite(price) || price <= 0)
            return;
        inMemoryQuoteCache.set(key, { expiresAtMs: Date.now() + ttlMs, price, updatedAtMs: Date.now(), source });
    };
    const inMemoryLastPrice = new Map();
    const normalizeSymbolKey = (sym) => String(sym || '').trim().toUpperCase().replace(/[^A-Z0-9$]/g, '');
    const getIngested = (sym) => {
        const k = normalizeSymbolKey(sym);
        if (!k)
            return null;
        const v = inMemoryLastPrice.get(k);
        if (!v)
            return null;
        if (Number.isFinite(INGEST_STALE_MS) && INGEST_STALE_MS > 0 && Date.now() - v.updatedAtMs > INGEST_STALE_MS) {
            return null;
        }
        return { price: v.price, updatedAtMs: v.updatedAtMs, source: v.source };
    };
    // Index cache for sectors/symbols
    let indexCache = null;
    const getIndex = () => {
        if (indexCache)
            return indexCache;
        const sectorsFile = resolveDataFile('sectors.csv');
        const symbolsFile = resolveDataFile('sectors_symbols.csv');
        indexCache = loadIndex(sectorsFile, symbolsFile);
        return indexCache;
    };
    const ingestPreHandler = async (req, reply) => {
        const ok = rateLimitCheck(String(req.ip ?? req.headers['x-forwarded-for'] ?? ''));
        if (!ok) {
            reply.code(429).send({ message: 'rate_limited' });
            return;
        }
        if (!INGEST_TOKEN)
            return;
        const token = String(req.headers['x-market-ingest-token'] ?? '').trim();
        if (!token || token !== INGEST_TOKEN) {
            reply.code(401).send({ message: 'unauthorized' });
            return;
        }
    };
    app.post('/api/v1/market/ingest/tick', {
        preHandler: ingestPreHandler,
        schema: {
            body: {
                type: 'object',
                properties: {
                    symbol: { type: 'string' },
                    priceBRL: { type: 'number' },
                    bid: { type: 'number' },
                    ask: { type: 'number' },
                    ts: { type: 'number' },
                    source: { type: 'string' },
                },
                required: ['symbol', 'priceBRL'],
            },
        },
    }, async (req, reply) => {
        const body = req.body ?? {};
        const symbol = normalizeSymbolKey(body.symbol);
        const priceBRL = Number(body.priceBRL);
        if (!symbol || !Number.isFinite(priceBRL) || priceBRL <= 0) {
            return reply.code(400).send({ message: 'invalid_tick' });
        }
        const now = Date.now();
        const ts = Number.isFinite(Number(body.ts)) && Number(body.ts) > 0 ? Number(body.ts) : now;
        const source = String(body.source ?? 'ingest').trim() || 'ingest';
        const bid = Number(body.bid);
        const ask = Number(body.ask);
        inMemoryLastPrice.set(symbol, {
            price: priceBRL,
            bid: Number.isFinite(bid) && bid > 0 ? bid : undefined,
            ask: Number.isFinite(ask) && ask > 0 ? ask : undefined,
            updatedAtMs: ts,
            source,
        });
        if (redis) {
            try {
                if (Number.isFinite(LAST_PRICE_TTL_SECONDS) && LAST_PRICE_TTL_SECONDS > 0) {
                    await redis.set(`${LAST_PRICE_PREFIX}${symbol}`, String(priceBRL), 'EX', LAST_PRICE_TTL_SECONDS);
                }
                else {
                    await redis.set(`${LAST_PRICE_PREFIX}${symbol}`, String(priceBRL));
                }
            }
            catch {
                // ignore
            }
        }
        try {
            app.server.emit('market:ingest_tick', { symbol, priceBRL, bid, ask, ts, source });
        }
        catch {
            // ignore
        }
        return reply.code(200).send({ ok: true, symbol, updatedAt: ts });
    });
    app.post('/api/v1/market/ingest/ticks', {
        preHandler: ingestPreHandler,
        schema: {
            body: {
                type: 'object',
                properties: {
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                symbol: { type: 'string' },
                                priceBRL: { type: 'number' },
                                bid: { type: 'number' },
                                ask: { type: 'number' },
                                ts: { type: 'number' },
                                source: { type: 'string' },
                            },
                            required: ['symbol', 'priceBRL'],
                        },
                    },
                },
                required: ['items'],
            },
        },
    }, async (req, reply) => {
        const body = req.body ?? {};
        const items = Array.isArray(body.items) ? body.items : [];
        const now = Date.now();
        let ok = 0;
        for (const it of items) {
            const symbol = normalizeSymbolKey(it?.symbol);
            const priceBRL = Number(it?.priceBRL);
            if (!symbol || !Number.isFinite(priceBRL) || priceBRL <= 0)
                continue;
            const ts = Number.isFinite(Number(it?.ts)) && Number(it.ts) > 0 ? Number(it.ts) : now;
            const source = String(it?.source ?? 'ingest').trim() || 'ingest';
            const bid = Number(it?.bid);
            const ask = Number(it?.ask);
            inMemoryLastPrice.set(symbol, {
                price: priceBRL,
                bid: Number.isFinite(bid) && bid > 0 ? bid : undefined,
                ask: Number.isFinite(ask) && ask > 0 ? ask : undefined,
                updatedAtMs: ts,
                source,
            });
            if (redis) {
                try {
                    if (Number.isFinite(LAST_PRICE_TTL_SECONDS) && LAST_PRICE_TTL_SECONDS > 0) {
                        await redis.set(`${LAST_PRICE_PREFIX}${symbol}`, String(priceBRL), 'EX', LAST_PRICE_TTL_SECONDS);
                    }
                    else {
                        await redis.set(`${LAST_PRICE_PREFIX}${symbol}`, String(priceBRL));
                    }
                }
                catch {
                    // ignore
                }
            }
            try {
                app.server.emit('market:ingest_tick', { symbol, priceBRL, bid, ask, ts, source });
            }
            catch {
                // ignore
            }
            ok++;
        }
        return reply.code(200).send({ ok: true, count: ok });
    });
    const fetchBcbRates = async (symbols) => {
        if (!breakerBcb.canRequest()) {
            throw new Error('bcb circuit open');
        }
        const out = new Map();
        const entries = symbols
            .map((s) => ({ symbol: s, code: bcbSgsCodeForRate(s) }))
            .filter((x) => x.code != null);
        for (const e of entries) {
            const cached = getCached(`bcb:${e.code}`);
            if (cached != null)
                out.set(e.symbol, cached.price);
        }
        const missing = entries.filter((e) => !out.has(e.symbol));
        if (missing.length === 0)
            return out;
        const concurrency = 4;
        let i = 0;
        const workers = Array.from({ length: concurrency }).map(async () => {
            while (i < missing.length) {
                const cur = missing[i++];
                const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${cur.code}/dados/ultimos/1?formato=json`;
                try {
                    const res = await fetch(url, {
                        method: 'GET',
                        headers: {
                            accept: 'application/json',
                            'user-agent': 'transaction-auth-engine/1.0',
                        },
                        signal: AbortSignal.timeout(15_000),
                    });
                    const arr = await res.json().catch(() => null);
                    const val = Number(arr?.[0]?.valor);
                    if (!Number.isFinite(val) || val <= 0)
                        continue;
                    out.set(cur.symbol, val);
                    setCached(`bcb:${cur.code}`, val, BCB_TTL_MS, 'bcb');
                }
                catch {
                }
            }
        });
        await Promise.all(workers);
        if (out.size === 0) {
            const err = new Error('bcb no rates');
            breakerBcb.onFailure(err);
            throw err;
        }
        breakerBcb.onSuccess();
        return out;
    };
    const fetchBinanceQuotes = async (symbols) => {
        const out = new Map();
        try {
            const pairs = symbols.map(s => `${s}USDT`);
            const url = `https://api.binance.com/api/v3/ticker/price?symbols=[${pairs.map(p => `"${p}"`).join(',')}]`;
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            for (const item of data) {
                const sym = item.symbol.replace('USDT', '');
                out.set(sym, parseFloat(item.price));
            }
        }
        catch {
            // Fallback to individual requests
            for (const sym of symbols) {
                try {
                    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}USDT`, { signal: AbortSignal.timeout(3000) });
                    const data = await res.json();
                    if (data.price)
                        out.set(sym, parseFloat(data.price));
                }
                catch { }
            }
        }
        return out;
    };
    async function getSectorQuotes(idx, sectorId, list) {
        const items = [];
        const normalizedSectorId = normalizeId(sectorId);
        if (normalizedSectorId === 'sector_008') {
            try {
                const symbols = list.map((s) => s.symbol.toUpperCase());
                for (const s of list) {
                    const key = s.symbol.toUpperCase();
                    const ing = getIngested(key);
                    if (ing != null) {
                        items.push({ symbol: key, exchange: s.exchange, priceBRL: ing.price, status: 'ok', updatedAt: ing.updatedAtMs, source: ing.source });
                    }
                    else {
                        items.push({ symbol: key, exchange: s.exchange, status: 'no_data', message: 'quote missing for global equity (MT5/Pepperstone not ingested)' });
                    }
                }
                return items;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                for (const s of list) {
                    const key = s.symbol.toUpperCase();
                    items.push({ symbol: key, exchange: s.exchange, status: 'no_data', message: `global quotes error: ${msg}` });
                }
                return items;
            }
        }
        if (normalizedSectorId === 'sector_029' || normalizedSectorId.startsWith('crypto_')) {
            try {
                const symbols = list.map((s) => s.symbol.toUpperCase());
                const prices = await fetchBinanceQuotes(symbols);
                for (const s of list) {
                    const key = s.symbol.toUpperCase();
                    const px = prices.get(key);
                    if (px != null)
                        items.push({ symbol: key, exchange: s.exchange, priceBRL: px, status: 'ok', updatedAt: Date.now(), source: 'binance' });
                    else
                        items.push({ symbol: key, exchange: s.exchange, status: 'no_data', message: 'binance quote missing for symbol (pair not found?)' });
                }
                return items;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                for (const s of list) {
                    const key = s.symbol.toUpperCase();
                    items.push({ symbol: key, exchange: s.exchange, status: 'no_data', message: `binance error: ${msg}` });
                }
                return items;
            }
        }
        if (normalizedSectorId === 'sector_052') {
            try {
                for (const s of list) {
                    const key = s.symbol.toUpperCase();
                    const ing = getIngested(key);
                    if (ing != null) {
                        items.push({ symbol: key, exchange: s.exchange, priceBRL: ing.price, status: 'ok', updatedAt: ing.updatedAtMs, source: ing.source });
                    }
                    else {
                        items.push({ symbol: key, exchange: s.exchange, status: 'no_data', message: 'quote missing for index (MT5/Pepperstone not ingested)' });
                    }
                }
                return items;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                for (const s of list) {
                    const key = s.symbol.toUpperCase();
                    items.push({ symbol: key, exchange: s.exchange, status: 'no_data', message: `index quotes error: ${msg}` });
                }
                return items;
            }
        }
        if (normalizedSectorId === 'sector_048') {
            try {
                const symbols = list.map((s) => s.symbol.toUpperCase());
                const prices = await fetchBcbRates(symbols);
                for (const s of list) {
                    const key = s.symbol.toUpperCase();
                    const px = prices.get(key);
                    if (px != null)
                        items.push({ symbol: key, exchange: s.exchange, priceBRL: px, status: 'ok', updatedAt: Date.now(), source: 'bcb' });
                    else
                        items.push({ symbol: key, exchange: s.exchange, status: 'no_data', message: 'bcb/sgs rate missing or unmapped for symbol' });
                }
                return items;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                for (const s of list) {
                    const key = s.symbol.toUpperCase();
                    items.push({ symbol: key, exchange: s.exchange, status: 'no_data', message: `bcb/sgs error: ${msg}` });
                }
                return items;
            }
        }
        const LAST_PRICE_PREFIX = 'market:lastPrice:v1:';
        for (const s of list) {
            const key = s.symbol.toUpperCase();
            const ing = getIngested(key);
            if (ing != null) {
                items.push({ symbol: key, exchange: s.exchange, priceBRL: ing.price, status: 'ok', updatedAt: ing.updatedAtMs, source: ing.source });
                continue;
            }
            if (redis) {
                try {
                    const v = await redis.get(`${LAST_PRICE_PREFIX}${key}`);
                    const priceBRL = Number(v);
                    if (Number.isFinite(priceBRL) && priceBRL > 0) {
                        items.push({ symbol: key, exchange: s.exchange, priceBRL, status: 'ok', updatedAt: Date.now(), source: 'redis' });
                        continue;
                    }
                }
                catch {
                }
            }
            if (!marketDataUrl) {
                items.push({
                    symbol: key,
                    exchange: s.exchange,
                    status: 'no_data',
                    message: redis ? 'no real-time price yet for symbol (Redis), and MARKET_DATA_URL not configured' : 'Redis not configured and MARKET_DATA_URL not configured',
                });
                continue;
            }
            try {
                const urls = [
                    `${marketDataUrl}/api/v1/stocks/${encodeURIComponent(key)}/quote`,
                    `${marketDataUrl}/stocks/${encodeURIComponent(key)}/quote`,
                ];
                let ok = false;
                let lastStatus = 0;
                let lastText = '';
                for (const url of urls) {
                    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(25_000) });
                    const text = await res.text();
                    lastStatus = res.status;
                    lastText = text;
                    let json = null;
                    try {
                        json = text ? JSON.parse(text) : null;
                    }
                    catch {
                        json = null;
                    }
                    const priceBRL = Number(json?.priceBRL);
                    if (res.status >= 200 && res.status < 300 && Number.isFinite(priceBRL) && priceBRL > 0) {
                        items.push({ symbol: key, exchange: s.exchange, priceBRL, status: 'ok', updatedAt: Date.now(), source: 'market-data' });
                        ok = true;
                        break;
                    }
                }
                if (!ok) {
                    items.push({ symbol: key, exchange: s.exchange, status: 'no_data', message: `market-data quote failed: ${lastStatus} ${lastText}` });
                }
            }
            catch (err) {
                const baseMsg = err instanceof Error ? err.message : String(err);
                items.push({ symbol: key, exchange: s.exchange, status: 'no_data', message: `market-data error: ${baseMsg}` });
            }
        }
        return items;
    }
    const bcbSgsCodeForRate = (sym) => {
        switch (String(sym || '').trim().toUpperCase()) {
            case 'SELIC':
                return 432;
            case 'CDI':
                return 12;
            case 'IPCA':
                return 433;
            case 'IGP-M':
                return 189;
            case 'IGP-DI':
                return 190;
            case 'INPC':
                return 188;
            case 'TR':
                return 226;
            case 'TJLP':
                return 256;
            default:
                return null;
        }
    };
    app.get('/api/v1/market/sectors', { preHandler: marketPreHandler }, async (req, reply) => {
        const idx = getIndex();
        const activeOnlyRaw = String(req.query.activeOnly ?? '').trim().toLowerCase();
        const activeOnly = activeOnlyRaw === '1' || activeOnlyRaw === 'true' || activeOnlyRaw === 'yes';
        const items = idx.sectors
            .map((s) => {
            const count = idx.symbolsBySectorId[s.sector_id]?.length ?? 0;
            const active = count > 0;
            const meta = getSectorMetaFromRow(idx.sectorsById[s.sector_id] ?? null);
            return {
                sectorId: s.sector_id,
                sectorName: s.sector_name,
                symbols: count,
                description: s.description ?? s.sector_name,
                active,
                source: meta.source,
                protocol: meta.protocol,
                frequency: meta.frequency,
                recommendation: meta.recommendation,
            };
        })
            .filter((s) => (activeOnly ? s.active : true));
        return reply.status(200).send({
            files: {
                sectors: idx.sectorsFilePath,
                sectorsMtimeMs: idx.sectorsFileMtimeMs,
                symbols: idx.symbolsFilePath,
                symbolsMtimeMs: idx.symbolsFileMtimeMs,
            },
            sectors: items,
        });
    });
    app.get('/api/v1/market/sectors/quotes', { preHandler: marketPreHandler }, async (req, reply) => {
        const idx = getIndex();
        const exchange = String(req.query.exchange ?? '').trim().toUpperCase();
        const limitRaw = req.query.limit;
        const limit = limitRaw == null || String(limitRaw).trim() === '' ? 50 : Number(limitRaw);
        const hardCap = 5_000;
        const finalLimit = !Number.isFinite(limit) ? 50 : Math.max(1, Math.min(hardCap, Math.trunc(limit)));
        const activeSectors = idx.sectors.filter((s) => (idx.symbolsBySectorId[s.sector_id]?.length ?? 0) > 0);
        const out = [];
        for (const s of activeSectors) {
            let list = idx.symbolsBySectorId[s.sector_id] ?? [];
            if (exchange)
                list = list.filter((x) => x.exchange === exchange);
            list = list.slice(0, finalLimit);
            const items = await getSectorQuotes(idx, s.sector_id, list);
            out.push({ sectorId: s.sector_id, total: items.length, items });
        }
        return reply.status(200).send({
            totalSectors: out.length,
            limit: finalLimit,
            exchange: exchange || null,
            sectors: out,
        });
    });
    app.get('/api/v1/market/health', { preHandler: marketPreHandler }, async (_req, reply) => {
        return reply.status(200).send({
            ts: Date.now(),
            providers: {
                binance: breakerBinance.snapshot(),
                bcb: breakerBcb.snapshot(),
            },
            config: {
                dataDir: String(process.env.DATA_DIR ?? ''),
                cacheTtlMs: CACHE_TTL_MS,
                ttl: {
                    binance: BINANCE_TTL_MS,
                    bcb: BCB_TTL_MS,
                },
                rateLimit: {
                    windowMs: RATE_LIMIT_WINDOW_MS,
                    max: RATE_LIMIT_MAX,
                },
                circuitBreaker: {
                    failureThreshold: cbFailureThreshold,
                    openMs: cbOpenMs,
                },
            },
        });
    });
    app.get('/api/v1/market/sectors/:sectorId/symbols', { preHandler: marketPreHandler }, async (req, reply) => {
        const idx = getIndex();
        const sectorId = normalizeId(req.params.sectorId);
        const exchange = String(req.query.exchange ?? '').trim().toUpperCase();
        const type = String(req.query.type ?? '').trim();
        const limitRaw = req.query.limit;
        const limit = limitRaw == null || String(limitRaw).trim() === '' ? null : Number(limitRaw);
        const hardCap = 50_000;
        let list = idx.symbolsBySectorId[sectorId] ?? [];
        if (exchange)
            list = list.filter((x) => x.exchange === exchange);
        if (type)
            list = list.filter((s) => String(s.type ?? '').trim() === type);
        const finalList = limit == null || !Number.isFinite(limit)
            ? list
            : list.slice(0, Math.max(1, Math.min(hardCap, Math.trunc(limit))));
        return reply.status(200).send({
            sectorId,
            total: finalList.length,
            symbols: finalList.map((s) => ({
                exchange: s.exchange,
                symbol: s.symbol,
                fullSymbol: s.full_symbol ?? `${s.exchange}\\${s.symbol}`,
                description: s.description ?? '',
                type: s.type ?? '',
            })),
        });
    });
    app.get('/api/v1/market/sectors/:sectorId/quotes', { preHandler: marketPreHandler }, async (req, reply) => {
        const idx = getIndex();
        const sectorId = normalizeId(req.params.sectorId);
        const exchange = String(req.query.exchange ?? '').trim().toUpperCase();
        const limitRaw = req.query.limit;
        const limit = limitRaw == null || String(limitRaw).trim() === '' ? null : Number(limitRaw);
        const hardCap = 50_000;
        let list = idx.symbolsBySectorId[sectorId] ?? [];
        if (exchange)
            list = list.filter((s) => s.exchange === exchange);
        if (limit != null && Number.isFinite(limit)) {
            list = list.slice(0, Math.max(1, Math.min(hardCap, Math.trunc(limit))));
        }
        const items = await getSectorQuotes(idx, sectorId, list);
        return reply.status(200).send({ sectorId, total: items.length, items });
    });
}

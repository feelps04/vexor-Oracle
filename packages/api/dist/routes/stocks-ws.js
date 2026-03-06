"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stocksWsRoutes = stocksWsRoutes;
const kafkajs_1 = require("kafkajs");
const TOPIC_TICKS = 'stocks.ticker';
const TOPIC_DEPTH_L2 = 'market.depth.l2';
const TOPIC_TRADES = 'market.trades';
const TOPIC_STATUS = 'market.status';
async function stocksWsRoutes(app, opts) {
    const { brokers, redis } = opts;
    const marketDataUrl = String(process.env.MARKET_DATA_URL ?? '').trim();
    const brapiToken = String(process.env.BRAPI_TOKEN ?? '').trim();
    const LAST_PRICE_PREFIX = 'market:lastPrice:v1:';
    const LAST_PRICE_TTL_SECONDS = Number(process.env.STOCKS_LAST_PRICE_TTL_SECONDS ?? 86_400);
    const STRESS_KEY = 'market:stress:v1';
    const symbolSubs = new Map();
    const feedSubs = new Set();
    const STREAM_TICKS = 'ticks';
    const STREAM_DEPTH_L2 = 'depth_l2';
    const STREAM_TRADES = 'trades';
    const STREAM_STATUS = 'status';
    const connStreams = new Map();
    const depthThrottleState = new Map();
    const normalizeStreams = (raw) => {
        if (!raw)
            return null;
        const out = new Set();
        for (const r of raw) {
            const v = String(r ?? '').trim().toLowerCase();
            if (!v)
                continue;
            if (v === STREAM_TICKS || v === 'tick' || v === 'ticks')
                out.add(STREAM_TICKS);
            else if (v === STREAM_DEPTH_L2 || v === 'depth' || v === 'l2' || v === 'depth_l2')
                out.add(STREAM_DEPTH_L2);
            else if (v === STREAM_TRADES || v === 'trade' || v === 'trades')
                out.add(STREAM_TRADES);
            else if (v === STREAM_STATUS || v === 'status')
                out.add(STREAM_STATUS);
        }
        if (out.size === 0)
            out.add(STREAM_TICKS);
        return out;
    };
    const lastPriceMem = new Map();
    const lastDepthMem = new Map();
    const lastTradesMem = new Map();
    let lastStatusMem = null;
    const parseSourceTs = (raw, fallback) => {
        const direct = Number(raw?.ts);
        if (Number.isFinite(direct) && direct > 0)
            return direct;
        const t = raw?.timestamp;
        if (typeof t === 'string') {
            const p = Date.parse(t);
            if (Number.isFinite(p) && p > 0)
                return p;
        }
        return fallback;
    };
    const broadcastTick = (params) => {
        const { symbol, priceBRL, ts, source, receivedAt } = params;
        lastTickTs = receivedAt;
        totalTicksSinceLastFlush += 1;
        perSecondCounts.set(symbol, (perSecondCounts.get(symbol) ?? 0) + 1);
        if (Number.isFinite(priceBRL) && priceBRL > 0) {
            lastPriceMem.set(symbol, priceBRL);
        }
        const subs = symbolSubs.get(symbol);
        if (!subs || subs.size === 0)
            return;
        const out = {
            symbol,
            priceBRL: Number.isFinite(priceBRL) ? priceBRL : 0,
            ts: Number.isFinite(ts) && ts > 0 ? ts : receivedAt,
            source: source || undefined,
        };
        const enqueueTick = (ws) => {
            const streams = connStreams.get(ws);
            if (streams && !streams.has(STREAM_TICKS))
                return;
            const mode = connMode.get(ws) ?? 'feed';
            if (mode === 'symbol' || !(Number.isFinite(TICK_BATCH_MS) && TICK_BATCH_MS > 0)) {
                try {
                    ws.send(JSON.stringify({ type: 'tick', ...out }));
                }
                catch {
                    // ignore
                }
                return;
            }
            let st = tickBatchState.get(ws);
            if (!st) {
                st = { items: [] };
                tickBatchState.set(ws, st);
            }
            st.items.push(out);
            if (st.items.length >= 500) {
                try {
                    ws.send(JSON.stringify({ type: 'ticks', ts: Date.now(), items: st.items }));
                }
                catch {
                    // ignore
                }
                st.items = [];
                if (st.timer) {
                    clearTimeout(st.timer);
                    delete st.timer;
                }
                return;
            }
            if (st.timer)
                return;
            st.timer = setTimeout(() => {
                const curr = tickBatchState.get(ws);
                if (!curr || curr.items.length === 0) {
                    if (curr?.timer) {
                        clearTimeout(curr.timer);
                        delete curr.timer;
                    }
                    return;
                }
                const items = curr.items;
                curr.items = [];
                if (curr.timer) {
                    clearTimeout(curr.timer);
                    delete curr.timer;
                }
                try {
                    ws.send(JSON.stringify({ type: 'ticks', ts: Date.now(), items }));
                }
                catch {
                    // ignore
                }
            }, TICK_BATCH_MS);
        };
        for (const ws of subs)
            enqueueTick(ws);
    };
    // When Kafka is not available (or when you want a local/parallel watchdog),
    // sectorRoutes can ingest ticks via HTTP and emit them through the Fastify instance.
    // We subscribe here and broadcast to WS clients.
    const INGEST_EVENT = 'market:ingest_tick';
    try {
        app.server.on(INGEST_EVENT, (ev) => {
            const receivedAt = Date.now();
            const symbol = String(ev?.symbol ?? '').trim().toUpperCase();
            const priceBRL = Number(ev?.priceBRL ?? ev?.price);
            if (!symbol)
                return;
            if (!Number.isFinite(priceBRL) || priceBRL <= 0)
                return;
            const ts = parseSourceTs(ev ?? {}, receivedAt);
            const source = String(ev?.source ?? '').trim() || undefined;
            broadcastTick({ symbol, priceBRL, ts, source, receivedAt });
        });
    }
    catch {
        // ignore
    }
    const initQuoteCache = new Map();
    const INIT_QUOTE_CACHE_TTL_MS = Number(process.env.STOCKS_WS_INIT_QUOTE_CACHE_TTL_MS ?? 60_000);
    const INIT_QUOTE_TIMEOUT_MS = Number(process.env.STOCKS_WS_INIT_QUOTE_TIMEOUT_MS ?? 2500);
    const fetchBrapiQuote = async (symbol) => {
        const sym = String(symbol || '').trim().toUpperCase();
        if (!sym)
            return null;
        const tokenParam = brapiToken ? `&token=${encodeURIComponent(brapiToken)}` : '';
        const url = `https://brapi.dev/api/quote/${encodeURIComponent(sym)}?fundamental=false${tokenParam}`;
        try {
            const res = await fetch(url, {
                method: 'GET',
                signal: AbortSignal.timeout(INIT_QUOTE_TIMEOUT_MS),
            });
            if (!res.ok)
                return null;
            const text = await res.text();
            let json = null;
            try {
                json = text ? JSON.parse(text) : null;
            }
            catch {
                json = null;
            }
            const r = Array.isArray(json?.results) ? json.results[0] : null;
            const price = Number(r?.regularMarketPrice ?? r?.price ?? r?.close);
            if (!Number.isFinite(price) || price <= 0)
                return null;
            return price;
        }
        catch {
            return null;
        }
    };
    const fetchMarketDataQuote = async (symbol) => {
        const sym = String(symbol || '').trim().toUpperCase();
        if (!sym)
            return null;
        const now = Date.now();
        const cached = initQuoteCache.get(sym);
        if (cached && now - cached.ts <= INIT_QUOTE_CACHE_TTL_MS && Number.isFinite(cached.price) && cached.price > 0) {
            return cached.price;
        }
        if (!marketDataUrl) {
            const p = await fetchBrapiQuote(sym);
            if (p != null && Number.isFinite(p) && p > 0) {
                initQuoteCache.set(sym, { price: p, ts: now });
                return p;
            }
            return null;
        }
        const url = `${marketDataUrl.replace(/\/$/, '')}/stocks/${encodeURIComponent(sym)}/quote`;
        try {
            const res = await fetch(url, {
                method: 'GET',
                signal: AbortSignal.timeout(INIT_QUOTE_TIMEOUT_MS),
            });
            if (!res.ok) {
                const p = await fetchBrapiQuote(sym);
                if (p != null && Number.isFinite(p) && p > 0) {
                    initQuoteCache.set(sym, { price: p, ts: now });
                    return p;
                }
                return null;
            }
            const text = await res.text();
            let json = null;
            try {
                json = text ? JSON.parse(text) : null;
            }
            catch {
                json = null;
            }
            const price = Number(json?.priceBRL ?? json?.price ?? json?.close ?? json?.last);
            if (!Number.isFinite(price) || price <= 0)
                return null;
            initQuoteCache.set(sym, { price, ts: now });
            return price;
        }
        catch {
            const p = await fetchBrapiQuote(sym);
            if (p != null && Number.isFinite(p) && p > 0) {
                initQuoteCache.set(sym, { price: p, ts: now });
                return p;
            }
            return null;
        }
    };
    const perSecondCounts = new Map();
    const prevSecondCounts = new Map();
    let totalTicksSinceLastFlush = 0;
    let prevTotalTicks = 0;
    let emaTicksPerSecond = 0;
    const EMA_ALPHA = 0.2;
    let flushTimer;
    let feedStatusTimer;
    let lastTickTs = 0;
    let lastDepthTs = 0;
    let lastTradeTs = 0;
    let lastStatusTs = 0;
    const allConns = new Set();
    const TICK_BATCH_MS = Number(process.env.STOCKS_WS_TICK_BATCH_MS ?? 50);
    const tickBatchState = new Map();
    const connMode = new Map();
    const FEED_STALE_AFTER_MS = Number(process.env.STOCKS_FEED_STALE_AFTER_MS ?? 15_000);
    const DEPTH_THROTTLE_MS = Number(process.env.STOCKS_WS_DEPTH_THROTTLE_MS ?? 200);
    const TRADES_KEEP = Number(process.env.STOCKS_WS_TRADES_KEEP ?? 50);
    const OBS_LOG_MS = Number(process.env.STOCKS_WS_OBS_LOG_MS ?? 5000);
    const LATENCY_WARN_MS = Number(process.env.STOCKS_WS_LATENCY_WARN_MS ?? 250);
    const obs = {
        ticks: { count: 0, sum: 0, max: 0 },
        depth_l2: { count: 0, sum: 0, max: 0 },
        trades: { count: 0, sum: 0, max: 0 },
        status: { count: 0, sum: 0, max: 0 },
    };
    let obsTimer;
    const snapshotFeedStatus = () => {
        const now = Date.now();
        const ageMs = lastTickTs > 0 ? Math.max(0, now - lastTickTs) : Number.POSITIVE_INFINITY;
        const stale = !(Number.isFinite(ageMs) && ageMs <= FEED_STALE_AFTER_MS);
        const depthAgeMs = lastDepthTs > 0 ? Math.max(0, now - lastDepthTs) : null;
        const tradesAgeMs = lastTradeTs > 0 ? Math.max(0, now - lastTradeTs) : null;
        const statusAgeMs = lastStatusTs > 0 ? Math.max(0, now - lastStatusTs) : null;
        return {
            type: 'feed_status',
            ts: now,
            lastTickTs: lastTickTs || null,
            ageMs: Number.isFinite(ageMs) ? ageMs : null,
            stale,
            streams: {
                ticks: { lastTs: lastTickTs || null, ageMs: Number.isFinite(ageMs) ? ageMs : null, stale },
                depth_l2: {
                    lastTs: lastDepthTs || null,
                    ageMs: depthAgeMs,
                    stale: !(depthAgeMs != null && depthAgeMs <= FEED_STALE_AFTER_MS),
                },
                trades: {
                    lastTs: lastTradeTs || null,
                    ageMs: tradesAgeMs,
                    stale: !(tradesAgeMs != null && tradesAgeMs <= FEED_STALE_AFTER_MS),
                },
                status: {
                    lastTs: lastStatusTs || null,
                    ageMs: statusAgeMs,
                    stale: !(statusAgeMs != null && statusAgeMs <= FEED_STALE_AFTER_MS),
                },
            },
        };
    };
    const kafka = new kafkajs_1.Kafka({
        clientId: 'api-stocks-ws',
        brokers: brokers.split(',').map((s) => s.trim()),
        retry: { retries: 0 },
        logLevel: kafkajs_1.logLevel.NOTHING,
    });
    const groupId = process.env.STOCKS_WS_GROUP_ID ?? `api-stocks-bridge-${Date.now()}`;
    const consumer = kafka.consumer({ groupId });
    let stopping = false;
    let started = false;
    let starting = false;
    let retryTimer;
    let retryMs = 1000;
    const RETRY_MS_MAX = 30_000;
    const startConsumer = async () => {
        if (stopping || started || starting)
            return;
        starting = true;
        try {
            await consumer.connect();
            await consumer.subscribe({ topic: process.env.STOCKS_WS_TOPIC_TICKS ?? TOPIC_TICKS, fromBeginning: false });
            await consumer.subscribe({ topic: process.env.STOCKS_WS_TOPIC_DEPTH_L2 ?? TOPIC_DEPTH_L2, fromBeginning: false });
            await consumer.subscribe({ topic: process.env.STOCKS_WS_TOPIC_TRADES ?? TOPIC_TRADES, fromBeginning: false });
            await consumer.subscribe({ topic: process.env.STOCKS_WS_TOPIC_STATUS ?? TOPIC_STATUS, fromBeginning: false });
            started = true;
            retryMs = 1000;
            try {
                app.log.info({
                    topics: {
                        ticks: process.env.STOCKS_WS_TOPIC_TICKS ?? TOPIC_TICKS,
                        depth_l2: process.env.STOCKS_WS_TOPIC_DEPTH_L2 ?? TOPIC_DEPTH_L2,
                        trades: process.env.STOCKS_WS_TOPIC_TRADES ?? TOPIC_TRADES,
                        status: process.env.STOCKS_WS_TOPIC_STATUS ?? TOPIC_STATUS,
                    },
                    groupId,
                }, 'stocks-ws Kafka consumer started');
            }
            catch {
                // ignore
            }
            consumer
                .run({
                eachMessage: async ({ topic, message }) => {
                    const value = message.value?.toString();
                    if (!value)
                        return;
                    const receivedAt = Date.now();
                    const trackLatency = (stream, ts, symbol) => {
                        if (!(Number.isFinite(ts) && ts > 0))
                            return;
                        const ms = receivedAt - ts;
                        if (!Number.isFinite(ms) || ms < 0)
                            return;
                        const st = obs[stream];
                        st.count += 1;
                        st.sum += ms;
                        if (ms > st.max)
                            st.max = ms;
                        if (Number.isFinite(LATENCY_WARN_MS) && LATENCY_WARN_MS > 0 && ms >= LATENCY_WARN_MS) {
                            try {
                                app.log.warn({ stream, symbol, latencyMs: ms }, 'stocks-ws high latency');
                            }
                            catch {
                                // ignore
                            }
                        }
                    };
                    // --- ticks (L1)
                    if (topic === (process.env.STOCKS_WS_TOPIC_TICKS ?? TOPIC_TICKS)) {
                        let tick;
                        try {
                            tick = JSON.parse(value);
                        }
                        catch {
                            return;
                        }
                        if (tick.type && tick.type !== 'tick')
                            return;
                        const symbol = String(tick.symbol ?? '').toUpperCase();
                        if (!symbol)
                            return;
                        const price = Number(tick.priceBRL ?? tick.price);
                        const source = String(tick.source ?? '').trim() || undefined;
                        const sourceTs = Number(tick.ts) ||
                            (typeof tick.timestamp === 'string' ? Date.parse(tick.timestamp) : 0) ||
                            0;
                        const ts = Number.isFinite(sourceTs) && sourceTs > 0 ? sourceTs : receivedAt;
                        trackLatency('ticks', ts, symbol);
                        lastTickTs = receivedAt;
                        totalTicksSinceLastFlush += 1;
                        perSecondCounts.set(symbol, (perSecondCounts.get(symbol) ?? 0) + 1);
                        if (Number.isFinite(price) && price > 0) {
                            lastPriceMem.set(symbol, price);
                            if (redis) {
                                try {
                                    if (Number.isFinite(LAST_PRICE_TTL_SECONDS) && LAST_PRICE_TTL_SECONDS > 0) {
                                        await redis.set(`${LAST_PRICE_PREFIX}${symbol}`, String(price), 'EX', LAST_PRICE_TTL_SECONDS);
                                    }
                                    else {
                                        await redis.set(`${LAST_PRICE_PREFIX}${symbol}`, String(price));
                                    }
                                }
                                catch {
                                    // ignore
                                }
                            }
                        }
                        const subs = symbolSubs.get(symbol);
                        if (subs && subs.size > 0) {
                            const out = {
                                symbol,
                                priceBRL: Number.isFinite(price) ? price : 0,
                                ts: Number.isFinite(ts) ? ts : receivedAt,
                                source,
                            };
                            const enqueueTick = (ws) => {
                                const streams = connStreams.get(ws);
                                if (streams && !streams.has(STREAM_TICKS))
                                    return;
                                const mode = connMode.get(ws) ?? 'feed';
                                if (mode === 'symbol' || !(Number.isFinite(TICK_BATCH_MS) && TICK_BATCH_MS > 0)) {
                                    try {
                                        ws.send(JSON.stringify({ type: 'tick', ...out }));
                                    }
                                    catch {
                                        // ignore
                                    }
                                    return;
                                }
                                let st = tickBatchState.get(ws);
                                if (!st) {
                                    st = { items: [] };
                                    tickBatchState.set(ws, st);
                                }
                                st.items.push(out);
                                if (st.items.length >= 500) {
                                    try {
                                        ws.send(JSON.stringify({ type: 'ticks', ts: Date.now(), items: st.items }));
                                    }
                                    catch {
                                        // ignore
                                    }
                                    st.items = [];
                                    if (st.timer) {
                                        clearTimeout(st.timer);
                                        delete st.timer;
                                    }
                                    return;
                                }
                                if (st.timer)
                                    return;
                                st.timer = setTimeout(() => {
                                    const curr = tickBatchState.get(ws);
                                    if (!curr || curr.items.length === 0) {
                                        if (curr?.timer) {
                                            clearTimeout(curr.timer);
                                            delete curr.timer;
                                        }
                                        return;
                                    }
                                    const items = curr.items;
                                    curr.items = [];
                                    if (curr.timer) {
                                        clearTimeout(curr.timer);
                                        delete curr.timer;
                                    }
                                    try {
                                        ws.send(JSON.stringify({ type: 'ticks', ts: Date.now(), items }));
                                    }
                                    catch {
                                        // ignore
                                    }
                                }, TICK_BATCH_MS);
                            };
                            for (const ws of subs)
                                enqueueTick(ws);
                        }
                        return;
                    }
                    // --- L2 depth
                    if (topic === (process.env.STOCKS_WS_TOPIC_DEPTH_L2 ?? TOPIC_DEPTH_L2)) {
                        let raw;
                        try {
                            raw = JSON.parse(value);
                        }
                        catch {
                            return;
                        }
                        const symbol = String(raw.symbol ?? '').toUpperCase();
                        if (!symbol)
                            return;
                        const sourceTs = Number(raw.ts) || 0;
                        const ts = Number.isFinite(sourceTs) && sourceTs > 0 ? sourceTs : receivedAt;
                        trackLatency('depth_l2', ts, symbol);
                        const toLevel = (x) => {
                            const price = Number(x?.price ?? x?.p);
                            const size = Number(x?.size ?? x?.q);
                            if (!Number.isFinite(price) || price <= 0)
                                return null;
                            if (!Number.isFinite(size) || size < 0)
                                return null;
                            return { price, size };
                        };
                        const bids = (Array.isArray(raw.bids) ? raw.bids : [])
                            .map(toLevel)
                            .filter(Boolean)
                            .slice(0, 10);
                        const asks = (Array.isArray(raw.asks) ? raw.asks : [])
                            .map(toLevel)
                            .filter(Boolean)
                            .slice(0, 10);
                        const depth = { symbol, ts, bids, asks };
                        lastDepthMem.set(symbol, depth);
                        lastDepthTs = receivedAt;
                        const subs = symbolSubs.get(symbol);
                        if (!subs || subs.size === 0)
                            return;
                        for (const ws of subs) {
                            const streams = connStreams.get(ws);
                            if (streams && !streams.has(STREAM_DEPTH_L2))
                                continue;
                            // Throttle per-connection by DEPTH_THROTTLE_MS.
                            const st = depthThrottleState.get(ws) ?? { lastSentTs: 0 };
                            depthThrottleState.set(ws, st);
                            const now = Date.now();
                            if (st.lastSentTs > 0 && now - st.lastSentTs < DEPTH_THROTTLE_MS) {
                                st.pending = depth;
                                if (!st.timer) {
                                    const wait = Math.max(5, DEPTH_THROTTLE_MS - (now - st.lastSentTs));
                                    st.timer = setTimeout(() => {
                                        st.timer = undefined;
                                        const pending = st.pending;
                                        st.pending = undefined;
                                        if (!pending)
                                            return;
                                        try {
                                            st.lastSentTs = Date.now();
                                            ws.send(JSON.stringify({ type: 'depth_l2', ...pending }));
                                        }
                                        catch {
                                            // ignore
                                        }
                                    }, wait);
                                }
                                continue;
                            }
                            try {
                                st.lastSentTs = now;
                                ws.send(JSON.stringify({ type: 'depth_l2', ...depth }));
                            }
                            catch {
                                // ignore
                            }
                        }
                        return;
                    }
                    // --- time&sales trades
                    if (topic === (process.env.STOCKS_WS_TOPIC_TRADES ?? TOPIC_TRADES)) {
                        let raw;
                        try {
                            raw = JSON.parse(value);
                        }
                        catch {
                            return;
                        }
                        const symbol = String(raw.symbol ?? '').toUpperCase();
                        if (!symbol)
                            return;
                        const price = Number(raw.priceBRL ?? raw.price);
                        const size = Number(raw.size ?? raw.qty);
                        if (!Number.isFinite(price) || price <= 0)
                            return;
                        if (!Number.isFinite(size) || size <= 0)
                            return;
                        const sourceTs = Number(raw.ts) ||
                            (typeof raw.timestamp === 'string' ? Date.parse(raw.timestamp) : 0) ||
                            0;
                        const ts = Number.isFinite(sourceTs) && sourceTs > 0 ? sourceTs : receivedAt;
                        trackLatency('trades', ts, symbol);
                        const sideRaw = String(raw.side ?? '').toLowerCase();
                        const side = sideRaw === 'buy' || sideRaw === 'b' ? 'buy' : sideRaw === 'sell' || sideRaw === 's' ? 'sell' : undefined;
                        const trade = { symbol, ts, priceBRL: price, size, side, tradeId: raw.tradeId };
                        lastTradeTs = receivedAt;
                        const arr = lastTradesMem.get(symbol) ?? [];
                        arr.push(trade);
                        while (arr.length > TRADES_KEEP)
                            arr.shift();
                        lastTradesMem.set(symbol, arr);
                        const subs = symbolSubs.get(symbol);
                        if (!subs || subs.size === 0)
                            return;
                        for (const ws of subs) {
                            const streams = connStreams.get(ws);
                            if (streams && !streams.has(STREAM_TRADES))
                                continue;
                            try {
                                ws.send(JSON.stringify({ type: 'trade', ...trade }));
                            }
                            catch {
                                // ignore
                            }
                        }
                        return;
                    }
                    // --- market status
                    if (topic === (process.env.STOCKS_WS_TOPIC_STATUS ?? TOPIC_STATUS)) {
                        let raw;
                        try {
                            raw = JSON.parse(value);
                        }
                        catch {
                            return;
                        }
                        const status = String(raw.status ?? '').trim();
                        if (!status)
                            return;
                        const sourceTs = Number(raw.ts) ||
                            (typeof raw.timestamp === 'string' ? Date.parse(raw.timestamp) : 0) ||
                            0;
                        const ts = Number.isFinite(sourceTs) && sourceTs > 0 ? sourceTs : receivedAt;
                        trackLatency('status', ts, raw.symbol ? String(raw.symbol).toUpperCase() : undefined);
                        const st = {
                            ts,
                            venue: raw.venue,
                            symbol: raw.symbol ? String(raw.symbol).toUpperCase() : undefined,
                            status,
                            reason: raw.reason,
                        };
                        lastStatusMem = st;
                        lastStatusTs = receivedAt;
                        for (const ws of allConns) {
                            const streams = connStreams.get(ws);
                            if (streams && !streams.has(STREAM_STATUS))
                                continue;
                            try {
                                ws.send(JSON.stringify({ type: 'status', ...st }));
                            }
                            catch {
                                // ignore
                            }
                        }
                        return;
                    }
                },
            })
                .catch(async (err) => {
                // consumer.run can fail later (broker down, rebalance issues, etc). If we
                // don't handle it, the WS keeps serving stale init snapshots from Redis.
                started = false;
                try {
                    app.log.warn({ err }, 'stocks-ws Kafka consumer stopped; retrying');
                }
                catch {
                    // ignore
                }
                try {
                    await consumer.disconnect();
                }
                catch {
                    // ignore
                }
                if (!stopping && !retryTimer) {
                    const wait = Math.max(250, Math.min(RETRY_MS_MAX, retryMs));
                    retryMs = Math.min(RETRY_MS_MAX, retryMs * 2);
                    retryTimer = setTimeout(() => {
                        retryTimer = undefined;
                        void startConsumer();
                    }, wait);
                }
            });
        }
        catch {
            started = false;
            try {
                await consumer.disconnect();
            }
            catch {
                // ignore
            }
            if (!stopping && !retryTimer) {
                const wait = Math.max(250, Math.min(RETRY_MS_MAX, retryMs));
                retryMs = Math.min(RETRY_MS_MAX, retryMs * 2);
                try {
                    app.log.warn({ waitMs: wait }, 'stocks-ws Kafka consumer failed to start; retrying');
                }
                catch {
                    // ignore
                }
                retryTimer = setTimeout(() => {
                    retryTimer = undefined;
                    void startConsumer();
                }, wait);
            }
        }
        finally {
            starting = false;
        }
    };
    void startConsumer();
    const flushFeed = async () => {
        if (feedSubs.size === 0) {
            // Still reset counters so we don't accumulate unbounded in memory.
            for (const [k, v] of perSecondCounts.entries()) {
                prevSecondCounts.set(k, v);
                perSecondCounts.set(k, 0);
            }
            prevTotalTicks = totalTicksSinceLastFlush;
            totalTicksSinceLastFlush = 0;
            return;
        }
        const totalTicks = totalTicksSinceLastFlush;
        totalTicksSinceLastFlush = 0;
        const deltaTicks = totalTicks;
        emaTicksPerSecond = emaTicksPerSecond === 0 ? deltaTicks : emaTicksPerSecond * (1 - EMA_ALPHA) + deltaTicks * EMA_ALPHA;
        const baseline = Math.max(1, emaTicksPerSecond);
        const stressScore = deltaTicks / baseline;
        const movers = [];
        for (const [sym, cnt] of perSecondCounts.entries()) {
            const prev = prevSecondCounts.get(sym) ?? 0;
            prevSecondCounts.set(sym, cnt);
            perSecondCounts.set(sym, 0);
            if (cnt <= 0 && prev <= 0)
                continue;
            const spike = prev > 0 ? cnt / prev : cnt > 0 ? Number.POSITIVE_INFINITY : 0;
            movers.push({ symbol: sym, ticks: cnt, ticksPrev: prev, spike, lastPrice: lastPriceMem.get(sym) });
        }
        movers.sort((a, b) => {
            const as = Number.isFinite(a.spike) ? a.spike : 0;
            const bs = Number.isFinite(b.spike) ? b.spike : 0;
            if (bs !== as)
                return bs - as;
            return b.ticks - a.ticks;
        });
        const topN = Math.max(5, Math.min(50, Number(process.env.STOCKS_FEED_TOP_N ?? 20)));
        const top = movers.slice(0, topN);
        const level = stressScore >= 3 ? 'panic' : stressScore >= 1.7 ? 'hot' : stressScore >= 1.2 ? 'warm' : 'calm';
        const snapshot = {
            type: 'snapshot',
            ts: Date.now(),
            stress: {
                level,
                score: Number(stressScore.toFixed(2)),
                ticksPerSecond: deltaTicks,
                baseline: Number(baseline.toFixed(2)),
                change: prevTotalTicks > 0 ? Number((deltaTicks / prevTotalTicks).toFixed(2)) : null,
            },
            movers: top,
        };
        prevTotalTicks = deltaTicks;
        if (redis) {
            try {
                await redis.set(STRESS_KEY, JSON.stringify(snapshot.stress), 'EX', 10);
            }
            catch {
                // ignore
            }
        }
        const payload = JSON.stringify(snapshot);
        for (const ws of feedSubs) {
            try {
                ws.send(payload);
            }
            catch {
                // ignore
            }
        }
    };
    flushTimer = setInterval(() => {
        void flushFeed();
    }, 1000);
    feedStatusTimer = setInterval(() => {
        const payload = JSON.stringify(snapshotFeedStatus());
        for (const ws of allConns) {
            try {
                ws.send(payload);
            }
            catch {
                // ignore
            }
        }
    }, 1000);
    if (Number.isFinite(OBS_LOG_MS) && OBS_LOG_MS > 0) {
        obsTimer = setInterval(() => {
            const snap = {
                ticks: obs.ticks,
                depth_l2: obs.depth_l2,
                trades: obs.trades,
                status: obs.status,
            };
            const fmt = (x) => {
                const avg = x.count > 0 ? x.sum / x.count : null;
                return { count: x.count, avgMs: avg != null ? Number(avg.toFixed(2)) : null, maxMs: x.count > 0 ? x.max : null };
            };
            try {
                app.log.info({
                    latencyMs: {
                        ticks: fmt(snap.ticks),
                        depth_l2: fmt(snap.depth_l2),
                        trades: fmt(snap.trades),
                        status: fmt(snap.status),
                    },
                }, 'stocks-ws latency');
            }
            catch {
                // ignore
            }
            obs.ticks.count = 0;
            obs.ticks.sum = 0;
            obs.ticks.max = 0;
            obs.depth_l2.count = 0;
            obs.depth_l2.sum = 0;
            obs.depth_l2.max = 0;
            obs.trades.count = 0;
            obs.trades.sum = 0;
            obs.trades.max = 0;
            obs.status.count = 0;
            obs.status.sum = 0;
            obs.status.max = 0;
        }, OBS_LOG_MS);
    }
    app.get('/ws/stocks', { websocket: true }, (connection, req) => {
        const ws = connection.socket ??
            connection;
        const sock = ws;
        allConns.add(sock);
        const url = req.url ?? '';
        const u = new URL(url, 'http://localhost');
        const mode = String(u.searchParams.get('mode') ?? '').toLowerCase();
        const symbolsParam = String(u.searchParams.get('symbols') ?? '').trim();
        const symbolParam = String(u.searchParams.get('symbol') ?? '').trim();
        const normalizeSymbols = (raw) => {
            const arr = Array.isArray(raw) ? raw : raw.split(',');
            return arr
                .map((s) => String(s).trim().toUpperCase())
                .filter(Boolean);
        };
        const attachSymbol = (sym) => {
            if (!sym)
                return;
            if (!symbolSubs.has(sym))
                symbolSubs.set(sym, new Set());
            symbolSubs.get(sym).add(sock);
        };
        const detachSymbol = (sym) => {
            const set = symbolSubs.get(sym);
            if (!set)
                return;
            set.delete(sock);
            if (set.size === 0)
                symbolSubs.delete(sym);
        };
        const cleanupAll = (syms) => {
            for (const s of syms)
                detachSymbol(s);
            syms.clear();
            feedSubs.delete(sock);
        };
        // Mode: aggregated feed (1Hz snapshots)
        if (mode === 'feed') {
            connMode.set(sock, 'feed');
            const activeSymbols = new Set();
            const initialSymbols = normalizeSymbols(symbolsParam);
            // default stream set: ticks only
            if (!connStreams.has(sock))
                connStreams.set(sock, new Set([STREAM_TICKS]));
            for (const s of initialSymbols) {
                attachSymbol(s);
                activeSymbols.add(s);
            }
            // If symbols are provided, act as a multi-symbol tick stream for that watchlist.
            // If none are provided, keep aggregated movers snapshots (backward compatible).
            if (initialSymbols.length === 0) {
                feedSubs.add(sock);
            }
            const sendInitial = async () => {
                try {
                    const symbols = Array.from(activeSymbols);
                    const last = {};
                    const streams = connStreams.get(sock) ?? new Set([STREAM_TICKS]);
                    const depth = {};
                    const trades = {};
                    const status = lastStatusMem;
                    const pick = (symbols.length ? symbols : Array.from(lastPriceMem.keys())).slice(0, 200);
                    const pickUpper = pick.map((s) => String(s).toUpperCase());
                    // Fast path: in-memory prices
                    for (const sym of pickUpper) {
                        const p = lastPriceMem.get(sym);
                        if (p != null && Number.isFinite(p) && p > 0)
                            last[sym] = p;
                    }
                    // Fast path: Redis batch lookup
                    if (redis) {
                        try {
                            const keys = pickUpper.map((sym) => `${LAST_PRICE_PREFIX}${sym}`);
                            const vals = await redis.mget(...keys);
                            for (let i = 0; i < pickUpper.length; i++) {
                                const sym = pickUpper[i];
                                if (last[sym] != null)
                                    continue;
                                const n = Number(vals[i]);
                                if (Number.isFinite(n) && n > 0)
                                    last[sym] = n;
                            }
                        }
                        catch {
                            // ignore
                        }
                    }
                    // Backfill: quote source (market-data -> BRAPI)
                    const missing = pickUpper.filter((sym) => !(last[sym] != null && Number.isFinite(last[sym]) && last[sym] > 0));
                    const CONCURRENCY = Math.max(1, Math.min(10, Number(process.env.STOCKS_WS_INIT_QUOTE_CONCURRENCY ?? 5)));
                    for (let i = 0; i < missing.length; i += CONCURRENCY) {
                        const chunk = missing.slice(i, i + CONCURRENCY);
                        const results = await Promise.all(chunk.map(async (sym) => {
                            const md = await fetchMarketDataQuote(sym);
                            return { sym, price: md };
                        }));
                        for (const r of results) {
                            const p = r.price;
                            if (p != null && Number.isFinite(p) && p > 0)
                                last[r.sym] = p;
                        }
                    }
                    for (const sym of pickUpper) {
                        if (streams.has(STREAM_DEPTH_L2)) {
                            const d = lastDepthMem.get(sym);
                            if (d)
                                depth[sym] = d;
                        }
                        if (streams.has(STREAM_TRADES)) {
                            const t = lastTradesMem.get(sym);
                            if (t && t.length)
                                trades[sym] = t;
                        }
                    }
                    ws.send(JSON.stringify({
                        type: 'init',
                        ts: Date.now(),
                        lastPrices: last,
                        depthL2: streams.has(STREAM_DEPTH_L2) ? depth : undefined,
                        trades: streams.has(STREAM_TRADES) ? trades : undefined,
                        status: streams.has(STREAM_STATUS) ? status : undefined,
                        feedStatus: snapshotFeedStatus(),
                    }));
                    try {
                        console.log(`[stocks-ws] init sent symbols=${pickUpper.length} lastPrices=${Object.keys(last).length}`);
                    }
                    catch {
                        // ignore
                    }
                }
                catch {
                    // ignore
                }
            };
            sock.on('message', (data) => {
                let msg = null;
                try {
                    const raw = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
                    msg = JSON.parse(raw);
                }
                catch {
                    msg = null;
                }
                if (!msg || typeof msg !== 'object')
                    return;
                if (msg.type === 'set_symbols') {
                    try {
                        const n = Array.isArray(msg.symbols) ? msg.symbols.length : null;
                        console.log(`[stocks-ws] set_symbols received n=${n}`);
                        try {
                            sock.send(JSON.stringify({ type: 'ack', cmd: 'set_symbols', n, ts: Date.now() }));
                        }
                        catch {
                            // ignore
                        }
                    }
                    catch {
                        // ignore
                    }
                    const nextStreams = normalizeStreams(msg.streams);
                    if (nextStreams)
                        connStreams.set(sock, nextStreams);
                    const next = new Set(normalizeSymbols(msg.symbols));
                    for (const s of Array.from(activeSymbols)) {
                        if (!next.has(s))
                            detachSymbol(s);
                    }
                    for (const s of Array.from(next)) {
                        if (!activeSymbols.has(s))
                            attachSymbol(s);
                    }
                    activeSymbols.clear();
                    for (const s of Array.from(next))
                        activeSymbols.add(s);
                    // Push a fresh init snapshot so the UI can immediately display prices for
                    // all requested symbols (even if their next tick takes time to arrive).
                    void sendInitial();
                    return;
                }
                if (msg.type === 'focus') {
                    const sym = normalizeSymbols(msg.symbol)[0];
                    if (!sym)
                        return;
                    // Keep existing symbols, but ensure focused symbol is included.
                    if (!activeSymbols.has(sym)) {
                        attachSymbol(sym);
                        activeSymbols.add(sym);
                        feedSubs.delete(sock);
                        void sendInitial();
                    }
                    return;
                }
                if (msg.type === 'subscribe') {
                    const nextStreams = normalizeStreams(msg.streams);
                    if (nextStreams)
                        connStreams.set(sock, nextStreams);
                    for (const s of normalizeSymbols(msg.symbols)) {
                        if (activeSymbols.has(s))
                            continue;
                        attachSymbol(s);
                        activeSymbols.add(s);
                    }
                    if (activeSymbols.size > 0)
                        feedSubs.delete(sock);
                    void sendInitial();
                    return;
                }
                if (msg.type === 'unsubscribe') {
                    for (const s of normalizeSymbols(msg.symbols)) {
                        if (!activeSymbols.has(s))
                            continue;
                        detachSymbol(s);
                        activeSymbols.delete(s);
                    }
                    if (activeSymbols.size === 0)
                        feedSubs.add(sock);
                    void sendInitial();
                }
            });
            // Send init after handlers are attached so early client commands (set_symbols)
            // are not dropped by a race on connect.
            void sendInitial();
            sock.on('close', () => {
                allConns.delete(sock);
                connMode.delete(sock);
                connStreams.delete(sock);
                const ds = depthThrottleState.get(sock);
                if (ds?.timer)
                    clearTimeout(ds.timer);
                depthThrottleState.delete(sock);
                const st = tickBatchState.get(sock);
                if (st?.timer)
                    clearTimeout(st.timer);
                tickBatchState.delete(sock);
                cleanupAll(activeSymbols);
            });
            return;
        }
        // Mode: per-symbol tick stream (backward compatible)
        connMode.set(sock, 'symbol');
        const symbol = (symbolParam || 'PETR4').toUpperCase();
        if (!connStreams.has(sock))
            connStreams.set(sock, new Set([STREAM_TICKS]));
        const activeSymbols = new Set();
        attachSymbol(symbol);
        activeSymbols.add(symbol);
        const sendSymbolInit = async () => {
            try {
                const sym = String(symbol || '').trim().toUpperCase();
                const last = {};
                const mem = lastPriceMem.get(sym);
                if (mem != null && Number.isFinite(mem) && mem > 0) {
                    last[sym] = mem;
                }
                if (last[sym] == null && redis) {
                    try {
                        const v = await redis.get(`${LAST_PRICE_PREFIX}${sym}`);
                        const n = Number(v);
                        if (Number.isFinite(n) && n > 0)
                            last[sym] = n;
                    }
                    catch {
                        // ignore
                    }
                }
                // Always send init immediately. Backfill (if needed) runs asynchronously.
                const initTs = Date.now();
                try {
                    sock.send(JSON.stringify({ type: 'init', ts: initTs, lastPrices: last, feedStatus: snapshotFeedStatus() }));
                }
                catch {
                    // ignore
                }
                if (last[sym] == null) {
                    void (async () => {
                        try {
                            const md = await fetchMarketDataQuote(sym);
                            if (md == null || !Number.isFinite(md) || md <= 0)
                                return;
                            lastPriceMem.set(sym, md);
                            try {
                                sock.send(JSON.stringify({
                                    type: 'tick',
                                    symbol: sym,
                                    priceBRL: md,
                                    ts: Date.now(),
                                    source: 'init_quote',
                                }));
                            }
                            catch {
                                // ignore
                            }
                        }
                        catch {
                            // ignore
                        }
                    })();
                }
            }
            catch {
                // ignore
            }
        };
        void sendSymbolInit();
        sock.on('message', (data) => {
            let msg = null;
            try {
                const raw = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
                msg = JSON.parse(raw);
            }
            catch {
                msg = null;
            }
            if (!msg || typeof msg !== 'object')
                return;
            if (msg.type !== 'focus' && msg.type !== 'set_symbols')
                return;
            if (msg.type === 'set_symbols') {
                const nextStreams = normalizeStreams(msg.streams);
                if (nextStreams)
                    connStreams.set(sock, nextStreams);
            }
            const next = msg.type === 'focus'
                ? new Set(normalizeSymbols(msg.symbol).slice(0, 1))
                : new Set(normalizeSymbols(msg.symbols).slice(0, 50));
            for (const s of Array.from(activeSymbols)) {
                if (!next.has(s))
                    detachSymbol(s);
            }
            for (const s of Array.from(next)) {
                if (!activeSymbols.has(s))
                    attachSymbol(s);
            }
            activeSymbols.clear();
            for (const s of Array.from(next))
                activeSymbols.add(s);
        });
        sock.on('close', () => {
            allConns.delete(sock);
            connMode.delete(sock);
            connStreams.delete(sock);
            const ds = depthThrottleState.get(sock);
            if (ds?.timer)
                clearTimeout(ds.timer);
            depthThrottleState.delete(sock);
            const st = tickBatchState.get(sock);
            if (st?.timer)
                clearTimeout(st.timer);
            tickBatchState.delete(sock);
            cleanupAll(activeSymbols);
        });
    });
    app.addHook('onClose', async () => {
        stopping = true;
        if (flushTimer)
            clearInterval(flushTimer);
        if (feedStatusTimer)
            clearInterval(feedStatusTimer);
        if (obsTimer)
            clearInterval(obsTimer);
        try {
            await consumer.disconnect();
        }
        catch {
            // ignore
        }
    });
}

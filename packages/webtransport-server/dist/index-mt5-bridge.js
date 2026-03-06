import { geckos } from '@geckos.io/server';
import { createClient } from 'redis';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
const __dirname = dirname(fileURLToPath(import.meta.url));
// Configuration
const SENTINEL_API_URL = process.env.SENTINEL_API_URL || 'http://127.0.0.1:8765';
const GECKOS_PORT = parseInt(process.env.GECKOS_PORT || '9208');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS || '100');
// Data stores
const sectorSymbols = new Map();
const allSymbols = new Map();
const priceCache = new Map();
let redis = null;
// Load symbols from CSV
async function loadSymbols() {
    try {
        const csvPath = join(__dirname, '..', '..', '..', 'sectors_symbols.csv');
        const content = await readFile(csvPath, 'utf-8');
        const records = parse(content, { columns: true, skip_empty_lines: true });
        sectorSymbols.clear();
        allSymbols.clear();
        let total = 0;
        for (const record of records) {
            const sectorId = record.sector_id;
            if (!sectorSymbols.has(sectorId)) {
                sectorSymbols.set(sectorId, []);
            }
            sectorSymbols.get(sectorId).push(record);
            allSymbols.set(record.symbol, record);
            total++;
        }
        console.log(`[Bridge] Loaded ${total} symbols from ${sectorSymbols.size} sectors`);
    }
    catch (err) {
        console.error('[Bridge] Failed to load symbols:', err);
    }
}
// Fetch tick from Sentinel API (Python MT5/Pepperstone)
async function fetchTick(symbol, broker = 'mt5') {
    try {
        const response = await fetch(`${SENTINEL_API_URL}/tick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, broker })
        });
        if (!response.ok)
            return null;
        const data = await response.json();
        if (data.error) {
            return null;
        }
        return data;
    }
    catch (err) {
        return null;
    }
}
// Fetch ticks batch from Sentinel API
async function fetchTicksBatch(symbols, broker = 'mt5') {
    try {
        const response = await fetch(`${SENTINEL_API_URL}/ticks/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols, broker })
        });
        if (!response.ok)
            return {};
        const data = await response.json();
        return data.ticks || {};
    }
    catch (err) {
        return {};
    }
}
// Fetch all ticks from Sentinel API (1901 assets)
async function fetchAllTicks(broker = 'mt5', exchange, sectorId) {
    try {
        const body = { broker };
        if (exchange)
            body.exchange = exchange;
        if (sectorId)
            body.sector_id = sectorId;
        const response = await fetch(`${SENTINEL_API_URL}/ticks/all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok)
            return {};
        const data = await response.json();
        console.log(`[Bridge] Fetched ${data.count} ticks, ${data.failed} failed`);
        return data.ticks || {};
    }
    catch (err) {
        console.error('[Bridge] Error fetching all ticks:', err);
        return {};
    }
}
// Fetch ticks by sector
async function fetchTicksSector(sectorId, broker = 'mt5') {
    try {
        const response = await fetch(`${SENTINEL_API_URL}/ticks/sector`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sector_id: sectorId, broker })
        });
        if (!response.ok)
            return {};
        const data = await response.json();
        console.log(`[Bridge] Fetched sector ${sectorId} (${data.sector_name}): ${Object.keys(data.ticks).length} ticks`);
        return data.ticks || {};
    }
    catch (err) {
        console.error('[Bridge] Error fetching sector ticks:', err);
        return {};
    }
}
// Connect to MT5 via Sentinel API
async function connectMT5(login, password, server) {
    try {
        const response = await fetch(`${SENTINEL_API_URL}/mt5/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password, server })
        });
        const data = await response.json();
        return { ok: data.ok ?? false, account: data.account, error: data.error };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
}
// Connect to Pepperstone via Sentinel API
async function connectPepperstone(login, password, server) {
    try {
        const response = await fetch(`${SENTINEL_API_URL}/pepperstone/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password, server: server || 'Pepperstone-MT5' })
        });
        const data = await response.json();
        return { ok: data.ok ?? false, account: data.account, error: data.error };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
}
// Get API status
async function getApiStatus() {
    try {
        const response = await fetch(`${SENTINEL_API_URL}/status`);
        const data = await response.json();
        return data;
    }
    catch {
        return { mt5: false, pepperstone: false, total_assets: 0 };
    }
}
// Main
async function main() {
    console.log('[Bridge] Starting Geckos.io + Sentinel API Bridge...');
    console.log(`[Bridge] Sentinel API: ${SENTINEL_API_URL}`);
    console.log(`[Bridge] Geckos Port: ${GECKOS_PORT}`);
    // Load symbols
    await loadSymbols();
    // Connect to Redis (optional)
    try {
        redis = createClient({ url: REDIS_URL });
        redis.on('error', (err) => console.warn('[Bridge] Redis error:', err.message));
        await redis.connect();
        console.log('[Bridge] Redis connected');
    }
    catch (err) {
        console.warn('[Bridge] Redis not available, using memory cache');
        redis = null;
    }
    // Create Geckos server with CORS
    const io = geckos({
        portRange: {
            min: GECKOS_PORT,
            max: GECKOS_PORT + 100
        },
        cors: { origin: '*' }
    });
    // Client subscriptions
    const clientSubscriptions = new Map();
    const clientBroker = new Map();
    // Handle connections
    io.onConnection((channel) => {
        console.log('[Bridge] Client connected:', channel.id);
        const channelId = String(channel.id);
        clientSubscriptions.set(channelId, new Set());
        clientBroker.set(channelId, 'mt5');
        // Send initial status
        getApiStatus().then(status => {
            channel.emit('status', status);
        });
        // Handle broker selection
        channel.on('set_broker', (data) => {
            const broker = data?.broker || 'mt5';
            const channelId = String(channel.id);
            clientBroker.set(channelId, broker);
            console.log(`[Bridge] Client ${channel.id} using broker: ${broker}`);
        });
        // Handle MT5 connection
        channel.on('mt5_connect', async (data) => {
            const result = await connectMT5(data.login, data.password, data.server);
            channel.emit('mt5_connect_result', result);
        });
        // Handle Pepperstone connection
        channel.on('pepperstone_connect', async (data) => {
            const result = await connectPepperstone(data.login, data.password, data.server);
            channel.emit('pepperstone_connect_result', result);
        });
        // Handle symbol subscription
        channel.on('subscribe', async (data) => {
            const symbols = data?.symbols || [];
            const channelId = String(channel.id);
            const sub = clientSubscriptions.get(channelId) || new Set();
            sub.clear();
            for (const s of symbols) {
                sub.add(String(s).toUpperCase());
            }
            clientSubscriptions.set(channelId, sub);
            console.log(`[Bridge] Client ${channel.id} subscribed to ${sub.size} symbols`);
            // Fetch initial ticks
            const broker = clientBroker.get(channelId) || 'mt5';
            const ticks = await fetchTicksBatch(Array.from(sub), broker);
            if (Object.keys(ticks).length > 0) {
                channel.emit('ticks', { type: 'ticks', items: ticks });
            }
        });
        // Handle sector subscription
        channel.on('subscribe_sector', async (data) => {
            const sectorId = data?.sector_id;
            if (!sectorId)
                return;
            const channelId = String(channel.id);
            const broker = clientBroker.get(channelId) || 'mt5';
            console.log(`[Bridge] Client ${channel.id} subscribing to sector: ${sectorId}`);
            const ticks = await fetchTicksSector(sectorId, broker);
            if (Object.keys(ticks).length > 0) {
                channel.emit('ticks', { type: 'ticks', sector_id: sectorId, items: ticks });
            }
        });
        // Handle fetch all ticks (1901 assets)
        channel.on('fetch_all', async (data) => {
            const channelId = String(channel.id);
            const broker = clientBroker.get(channelId) || 'mt5';
            const exchange = data?.exchange;
            const sectorId = data?.sector_id;
            console.log(`[Bridge] Client ${channel.id} fetching all ticks (${broker})`);
            const ticks = await fetchAllTicks(broker, exchange, sectorId);
            channel.emit('ticks', {
                type: 'ticks',
                total: Object.keys(ticks).length,
                items: ticks
            });
        });
        // Handle single tick request
        channel.on('tick', async (data) => {
            const symbol = data?.symbol;
            if (!symbol)
                return;
            const channelId = String(channel.id);
            const broker = clientBroker.get(channelId) || 'mt5';
            const tick = await fetchTick(symbol, broker);
            if (tick) {
                channel.emit('tick', tick);
            }
        });
        // Handle disconnection
        channel.onDisconnect(() => {
            console.log('[Bridge] Client disconnected:', channel.id);
            const channelId = String(channel.id);
            clientSubscriptions.delete(channelId);
            clientBroker.delete(channelId);
        });
    });
    // Periodic tick broadcast for subscribed symbols
    let tickCount = 0;
    setInterval(async () => {
        tickCount++;
        // Buscar ticks da MMF via API (não precisa de MT5 conectado)
        const totalClients = clientSubscriptions.size;
        if (tickCount % 50 === 0) {
            console.log(`[Bridge] Tick interval #${tickCount}: ${totalClients} clients`);
        }
        if (totalClients === 0)
            return;
        for (const [clientId, symbols] of clientSubscriptions) {
            if (symbols.size === 0)
                continue;
            const broker = clientBroker.get(clientId) || 'mt5';
            const ticks = await fetchTicksBatch(Array.from(symbols).slice(0, 50), broker);
            const tickCount = Object.keys(ticks).length;
            if (tickCount > 0) {
                console.log(`[Bridge] Broadcasting ${tickCount} ticks to client ${clientId}`);
                io.emit('ticks', { type: 'ticks', items: ticks });
            }
        }
    }, TICK_INTERVAL_MS);
    // Start server
    io.listen(GECKOS_PORT + 1000);
    console.log(`[Bridge] Geckos.io server listening on UDP port ${GECKOS_PORT}-${GECKOS_PORT + 100}`);
    console.log(`[Bridge] HTTP server on port ${GECKOS_PORT + 1000}`);
    console.log(`[Bridge] Ready to serve ${allSymbols.size} assets from MT5/Pepperstone`);
}
main().catch(console.error);

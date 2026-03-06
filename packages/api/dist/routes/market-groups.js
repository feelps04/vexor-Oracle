"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketGroupsRoutes = marketGroupsRoutes;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function normalizeGroupKey(input) {
    return String(input || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '');
}
function defaultGroupsFilePath() {
    const cwd = process.cwd();
    const candidates = [
        node_path_1.default.join(cwd, 'grupo.txt'),
        node_path_1.default.join(cwd, '..', '..', 'grupo.txt'),
        node_path_1.default.join(cwd, '..', '..', '..', 'grupo.txt'),
    ];
    for (const p of candidates) {
        try {
            if (node_fs_1.default.existsSync(p))
                return p;
        }
        catch {
        }
    }
    return node_path_1.default.join(cwd, 'grupo.txt');
}
function parseGroupsFile(filePath) {
    const st = node_fs_1.default.statSync(filePath);
    const raw = node_fs_1.default.readFileSync(filePath, 'utf8');
    const lines = raw
        .split(/\r?\n/g)
        .map((l) => String(l || '').trim())
        .filter(Boolean)
        .filter((l) => !l.startsWith('===') && !l.startsWith('---') && !l.toLowerCase().startsWith('gerado em'));
    const groups = {};
    for (const line of lines) {
        // Expected: GROUP\\SYMBOL (may contain deeper paths, we take the first segment as group)
        const cleaned = line.replace(/\//g, '\\');
        const parts = cleaned.split('\\').filter(Boolean);
        if (parts.length < 2)
            continue;
        const groupKey = normalizeGroupKey(parts[0]);
        const symbol = String(parts[parts.length - 1] || '').trim().toUpperCase();
        if (!groupKey || !symbol)
            continue;
        if (!groups[groupKey])
            groups[groupKey] = [];
        groups[groupKey].push(symbol);
    }
    for (const [g, syms] of Object.entries(groups)) {
        groups[g] = Array.from(new Set(syms)).sort();
    }
    const allGroupsSorted = Object.keys(groups).sort();
    return {
        groups,
        allGroupsSorted,
        loadedAtMs: Date.now(),
        sourcePath: filePath,
        sourceMtimeMs: st.mtimeMs,
    };
}
async function marketGroupsRoutes(app) {
    const groupsFilePath = String(process.env.MARKET_GROUPS_FILE ?? '').trim() || defaultGroupsFilePath();
    const CACHE_TTL_MS = Number(process.env.MARKET_GROUPS_CACHE_TTL_MS ?? 10_000);
    let cache = null;
    const getIndex = () => {
        const now = Date.now();
        if (cache && now - cache.loadedAtMs <= CACHE_TTL_MS)
            return cache;
        if (!node_fs_1.default.existsSync(groupsFilePath)) {
            cache = {
                groups: {},
                allGroupsSorted: [],
                loadedAtMs: now,
                sourcePath: groupsFilePath,
                sourceMtimeMs: 0,
            };
            return cache;
        }
        try {
            const st = node_fs_1.default.statSync(groupsFilePath);
            if (cache && cache.sourceMtimeMs === st.mtimeMs && now - cache.loadedAtMs <= CACHE_TTL_MS)
                return cache;
        }
        catch {
        }
        cache = parseGroupsFile(groupsFilePath);
        return cache;
    };
    app.get('/api/v1/market/groups', async (_req, reply) => {
        const idx = getIndex();
        const items = idx.allGroupsSorted.map((g) => ({ group: g, symbols: idx.groups[g]?.length ?? 0 }));
        return reply.status(200).send({
            file: idx.sourcePath,
            mtimeMs: idx.sourceMtimeMs,
            groups: items,
        });
    });
    app.get('/api/v1/market/groups/:group/symbols', async (req, reply) => {
        const idx = getIndex();
        const groupKey = normalizeGroupKey(req.params.group);
        const list = idx.groups[groupKey] ?? [];
        const limit = Math.max(1, Math.min(2000, Number(req.query.limit ?? 500)));
        return reply.status(200).send({
            group: groupKey,
            total: list.length,
            symbols: list.slice(0, limit),
        });
    });
}

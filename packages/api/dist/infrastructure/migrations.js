"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const path_1 = __importDefault(require("path"));
async function loadMigrations() {
    const fs = await import('fs/promises');
    const dir = path_1.default.join(process.cwd(), 'packages', 'api', 'migrations');
    let entries = [];
    try {
        entries = await fs.readdir(dir);
    }
    catch {
        // allow running without migrations folder mounted
        return [];
    }
    const sqlFiles = entries
        .filter((f) => /^\d+_.*\.sql$/i.test(f))
        .sort((a, b) => a.localeCompare(b));
    const migrations = [];
    for (const filename of sqlFiles) {
        const version = filename.split('_')[0];
        const sql = await fs.readFile(path_1.default.join(dir, filename), 'utf8');
        migrations.push({ version, filename, sql });
    }
    return migrations;
}
async function runMigrations(pg) {
    const migrations = await loadMigrations();
    if (migrations.length === 0)
        return;
    await pg.query('BEGIN');
    try {
        // Ensure schema table exists
        await pg.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
        const appliedRes = await pg.query('SELECT version FROM schema_migrations');
        const applied = new Set(appliedRes.rows.map((r) => r.version));
        for (const m of migrations) {
            if (applied.has(m.version))
                continue;
            await pg.query(m.sql);
            await pg.query('INSERT INTO schema_migrations(version) VALUES ($1)', [m.version]);
        }
        await pg.query('COMMIT');
    }
    catch (err) {
        await pg.query('ROLLBACK');
        throw err;
    }
}

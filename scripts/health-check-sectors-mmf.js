import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {
    baseUrl: 'http://127.0.0.1:8000',
    csv: path.join(process.cwd(), 'sectors_symbols.csv'),
    timeoutMs: 2500,
    concurrency: 25,
    retries: 1,
    maxSymbols: 0,
    outDir: path.join(process.cwd(), 'scripts', 'health-check-output'),
  };

  for (let i = 2; i < argv.length; i++) {
    const a = String(argv[i] ?? '');
    const next = i + 1 < argv.length ? String(argv[i + 1]) : '';

    if (a === '--baseUrl' && next) {
      out.baseUrl = next;
      i++;
    } else if (a === '--csv' && next) {
      out.csv = next;
      i++;
    } else if (a === '--timeoutMs' && next) {
      out.timeoutMs = Number(next);
      i++;
    } else if (a === '--concurrency' && next) {
      out.concurrency = Number(next);
      i++;
    } else if (a === '--retries' && next) {
      out.retries = Number(next);
      i++;
    } else if (a === '--maxSymbols' && next) {
      out.maxSymbols = Number(next);
      i++;
    } else if (a === '--outDir' && next) {
      out.outDir = next;
      i++;
    }
  }

  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) out.timeoutMs = 2500;
  if (!Number.isFinite(out.concurrency) || out.concurrency <= 0) out.concurrency = 25;
  if (!Number.isFinite(out.retries) || out.retries < 0) out.retries = 0;
  if (!Number.isFinite(out.maxSymbols) || out.maxSymbols < 0) out.maxSymbols = 0;

  return out;
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

function loadSymbolsFromSectorsCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw
    .split(/\r?\n/g)
    .map((l) => String(l || '').trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const symIdx = header.findIndex((h) => String(h || '').trim().toLowerCase() === 'symbol');
  if (symIdx < 0) throw new Error(`CSV missing column 'symbol': ${filePath}`);

  const set = new Set();
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    const sym = String(parts[symIdx] ?? '').trim().toUpperCase();
    if (sym) set.add(sym);
  }
  return Array.from(set);
}

function isoCompact(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, text, json };
  } finally {
    clearTimeout(t);
  }
}

async function checkOneSymbol(baseUrl, symbol, timeoutMs, retries) {
  const url = `${baseUrl.replace(/\/+$/g, '')}/api/v1/stocks/${encodeURIComponent(symbol)}/quote`;

  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const out = await fetchJsonWithTimeout(url, timeoutMs);
      last = out;
      const price = Number(out?.json?.priceBRL);
      if (out.status >= 200 && out.status < 300 && Number.isFinite(price) && price > 0) {
        return { symbol, ok: true, priceBRL: price, status: out.status };
      }
    } catch (err) {
      last = { status: 0, text: err instanceof Error ? err.message : String(err), json: null };
    }
  }

  return {
    symbol,
    ok: false,
    priceBRL: null,
    status: last?.status ?? 0,
    message: last?.status ? `HTTP ${last.status} ${String(last.text ?? '').trim()}` : String(last?.text ?? 'fetch failed'),
  };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let idx = 0;

  async function runOne() {
    while (true) {
      const my = idx++;
      if (my >= items.length) return;
      results[my] = await worker(items[my], my);
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => runOne()));
  return results;
}

async function main() {
  const cfg = parseArgs(process.argv);

  if (!fs.existsSync(cfg.csv)) {
    throw new Error(`CSV not found: ${cfg.csv}`);
  }

  const symbolsAll = loadSymbolsFromSectorsCsv(cfg.csv);
  const symbols = cfg.maxSymbols && cfg.maxSymbols > 0 ? symbolsAll.slice(0, cfg.maxSymbols) : symbolsAll;

  if (!fs.existsSync(cfg.outDir)) fs.mkdirSync(cfg.outDir, { recursive: true });
  const stamp = isoCompact(new Date());

  const startedAt = Date.now();
  const rows = await runPool(symbols, cfg.concurrency, async (sym) => {
    return checkOneSymbol(cfg.baseUrl, sym, cfg.timeoutMs, cfg.retries);
  });
  const durationMs = Date.now() - startedAt;

  const ok = rows.filter((r) => r && r.ok);
  const missing = rows.filter((r) => r && !r.ok);

  const summary = {
    baseUrl: cfg.baseUrl,
    csv: cfg.csv,
    totalSymbols: symbols.length,
    ok: ok.length,
    missing: missing.length,
    durationMs,
    timestamp: new Date().toISOString(),
  };

  const outJson = path.join(cfg.outDir, `sectors-mmf-health-${stamp}.json`);
  fs.writeFileSync(outJson, JSON.stringify({ summary, rows }, null, 2), 'utf8');

  const outCsv = path.join(cfg.outDir, `sectors-mmf-health-${stamp}.csv`);
  const csvLines = ['symbol,ok,priceBRL,status,message'];
  for (const r of rows) {
    const msg = String(r?.message ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    csvLines.push(`${r.symbol},${r.ok ? '1' : '0'},${r.priceBRL ?? ''},${r.status ?? ''},"${msg}"`);
  }
  fs.writeFileSync(outCsv, csvLines.join('\n'), 'utf8');

  console.log(JSON.stringify(summary, null, 2));
  console.log(`report.json=${outJson}`);
  console.log(`report.csv=${outCsv}`);

  if (missing.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

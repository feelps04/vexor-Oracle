import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {
    baseUrl: 'http://127.0.0.1:8000',
    csv: path.join(process.cwd(), 'sectors_symbols.csv'),
    timeoutMs: 5000,
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
    } else if (a === '--outDir' && next) {
      out.outDir = next;
      i++;
    }
  }

  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) out.timeoutMs = 5000;
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

function loadSymbolsFromCsv(filePath) {
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
  return Array.from(set).sort();
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

async function main() {
  const cfg = parseArgs(process.argv);
  if (!fs.existsSync(cfg.csv)) throw new Error(`CSV not found: ${cfg.csv}`);

  const csvSyms = loadSymbolsFromCsv(cfg.csv);

  const symbolsUrl = `${cfg.baseUrl.replace(/\/+$/g, '')}/symbols?limit=20000`;
  const mmf = await fetchJsonWithTimeout(symbolsUrl, cfg.timeoutMs);
  if (!(mmf.status >= 200 && mmf.status < 300)) {
    throw new Error(`MMF /symbols failed: ${mmf.status} ${mmf.text}`);
  }

  const mmfSyms = Array.isArray(mmf.json?.symbols)
    ? mmf.json.symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean)
    : [];

  const mmfSet = new Set(mmfSyms);
  const missing = csvSyms.filter((s) => !mmfSet.has(s));
  const ok = csvSyms.filter((s) => mmfSet.has(s));

  if (!fs.existsSync(cfg.outDir)) fs.mkdirSync(cfg.outDir, { recursive: true });
  const stamp = isoCompact(new Date());

  const summary = {
    baseUrl: cfg.baseUrl,
    csv: cfg.csv,
    mmfCount: mmfSyms.length,
    csvTotal: csvSyms.length,
    ok: ok.length,
    missing: missing.length,
    timestamp: new Date().toISOString(),
  };

  const outJson = path.join(cfg.outDir, `sectors-mmf-map-${stamp}.json`);
  fs.writeFileSync(outJson, JSON.stringify({ summary, missing, okSample: ok.slice(0, 50) }, null, 2), 'utf8');

  const outTxt = path.join(cfg.outDir, `sectors-mmf-map-missing-${stamp}.txt`);
  fs.writeFileSync(outTxt, missing.join('\n') + (missing.length ? '\n' : ''), 'utf8');

  console.log(JSON.stringify(summary, null, 2));
  console.log(`missing.txt=${outTxt}`);
  console.log(`report.json=${outJson}`);

  if (missing.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

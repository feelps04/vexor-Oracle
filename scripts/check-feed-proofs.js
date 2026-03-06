const http = require('node:http');
const https = require('node:https');

function getenv(name, defv) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : defv;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGetJson(url, timeoutMs) {
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers: { Accept: 'application/json' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 0, text, json });
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      try {
        req.destroy(new Error('timeout'));
      } catch {
        // ignore
      }
    });

    req.end();
  });
}

async function checkHealth(baseUrl) {
  const r = await httpGetJson(`${baseUrl}/health`, 2500);
  return r;
}

async function checkQuote(baseUrl, symbol) {
  const r = await httpGetJson(`${baseUrl}/api/v1/stocks/${encodeURIComponent(symbol)}/quote`, 3500);
  return r;
}

async function checkWs(baseUrl, symbol) {
  // Use global WebSocket (Node 20+). If unavailable, fail gracefully.
  if (typeof WebSocket !== 'function') {
    return {
      ok: false,
      reason: 'WebSocket global not available in this Node version. Run with Node 20+.',
    };
  }

  const u = new URL(baseUrl);
  const host = u.hostname === 'localhost' || u.hostname === '::1' ? '127.0.0.1' : u.hostname;
  const proto = u.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${proto}://${host}:${u.port}/ws/stocks?symbol=${encodeURIComponent(symbol)}`;

  return await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    const startedAt = Date.now();

    let gotAny = false;
    let gotTick = false;
    let gotInit = false;

    const finish = (ok, extra) => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve({ ok, wsUrl, gotAny, gotInit, gotTick, elapsedMs: Date.now() - startedAt, ...extra });
    };

    const timer = setTimeout(() => {
      finish(false, { reason: 'timeout waiting for init/tick' });
    }, 6000);

    ws.onopen = () => {
      try {
        ws.send(
          JSON.stringify({
            type: 'set_symbols',
            symbols: [String(symbol).toUpperCase()],
            streams: ['ticks'],
          })
        );
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      finish(false, { reason: 'ws_error' });
    };

    ws.onmessage = (ev) => {
      gotAny = true;
      let msg = null;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'init') {
        gotInit = true;
        // init can be enough if it contains lastPrices
        const p = Number(msg?.lastPrices?.[String(symbol).toUpperCase()]);
        if (Number.isFinite(p) && p > 0) {
          clearTimeout(timer);
          finish(true, { initPrice: p });
          return;
        }
      }

      if (msg.type === 'tick') {
        const sym = String(msg.symbol || '').toUpperCase();
        if (sym && sym !== String(symbol).toUpperCase()) return;
        const p = Number(msg.priceBRL);
        if (Number.isFinite(p) && p > 0) {
          gotTick = true;
          clearTimeout(timer);
          finish(true, { tickPrice: p });
        }
      }
    };
  });
}

async function main() {
  const baseUrl = getenv('API_BASE_URL', 'http://127.0.0.1:3000');
  const symbol = getenv('SYMBOL', 'WINJ26').toUpperCase();

  process.stdout.write(`[check-feed-proofs] baseUrl=${baseUrl} symbol=${symbol}\n`);

  // Proof 1: health
  try {
    const h = await checkHealth(baseUrl);
    process.stdout.write(`[proof1] GET /health status=${h.status} body=${h.text}\n`);
    if (h.status !== 200) process.exitCode = 2;
  } catch (err) {
    process.stdout.write(`[proof1] FAILED err=${err?.message || String(err)}\n`);
    process.exitCode = 2;
  }

  // Proof 2: quote
  try {
    const q = await checkQuote(baseUrl, symbol);
    process.stdout.write(`[proof2] GET /api/v1/stocks/${symbol}/quote status=${q.status} body=${q.text}\n`);
    if (q.status !== 200) process.exitCode = 3;
  } catch (err) {
    process.stdout.write(`[proof2] FAILED err=${err?.message || String(err)}\n`);
    process.exitCode = 3;
  }

  // Proof 3: websocket
  try {
    const w = await checkWs(baseUrl, symbol);
    process.stdout.write(`[proof3] WS ok=${w.ok} url=${w.wsUrl || ''} gotInit=${w.gotInit} gotTick=${w.gotTick} elapsedMs=${w.elapsedMs} ${w.reason ? `reason=${w.reason}` : ''}\n`);
    if (w.initPrice) process.stdout.write(`[proof3] initPrice=${w.initPrice}\n`);
    if (w.tickPrice) process.stdout.write(`[proof3] tickPrice=${w.tickPrice}\n`);
    if (!w.ok) process.exitCode = 4;
  } catch (err) {
    process.stdout.write(`[proof3] FAILED err=${err?.message || String(err)}\n`);
    process.exitCode = 4;
  }

  // If quote is missing but WS is ok, that's still helpful to debug caching.
  await sleep(50);
}

main().catch((err) => {
  process.stderr.write(`[check-feed-proofs] fatal err=${err?.message || String(err)}\n`);
  process.exit(1);
});

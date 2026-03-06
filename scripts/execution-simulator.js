const net = require('node:net');

function getenv(name, defv) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : defv;
}

function getenvInt(name, defv) {
  const v = process.env[name];
  const n = Number(v);
  return Number.isFinite(n) ? n : defv;
}

function nowIso() {
  return new Date().toISOString();
}

function parseFixLike(raw) {
  const s = String(raw ?? '');
  const sep = s.includes('\u0001') ? '\u0001' : '|';
  const out = {};
  for (const part of s.split(sep)) {
    if (!part) continue;
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

function normalizeOrder(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const j = JSON.parse(trimmed);
      return {
        raw: trimmed,
        type: 'json',
        side: j.side ?? j.Side ?? j.SIDE,
        symbol: j.symbol ?? j.Symbol ?? j.SYMBOL,
        qty: j.qty ?? j.quantity ?? j.Qty ?? j.OrderQty,
        price: j.price ?? j.Price,
        ts: j.ts ?? Date.now(),
        clientOrderId: j.clientOrderId ?? j.clOrdId ?? j.ClOrdID,
      };
    } catch {
      return { raw: trimmed, type: 'text', ts: Date.now() };
    }
  }

  const fix = parseFixLike(trimmed);
  if (Object.keys(fix).length > 0) {
    const side = fix['54'] || fix['Side'] || fix['side'];
    const symbol = fix['55'] || fix['Symbol'] || fix['symbol'];
    const qty = fix['38'] || fix['OrderQty'] || fix['qty'] || fix['quantity'];
    const price = fix['44'] || fix['Price'] || fix['price'];
    const clOrdId = fix['11'] || fix['ClOrdID'] || fix['clientOrderId'];

    return {
      raw: trimmed,
      type: 'fix',
      side,
      symbol,
      qty: qty != null ? Number(qty) : undefined,
      price: price != null ? Number(price) : undefined,
      ts: Date.now(),
      clientOrderId: clOrdId,
      fix,
    };
  }

  return { raw: trimmed, type: 'text', ts: Date.now() };
}

const HOST = getenv('EXEC_SIM_HOST', '127.0.0.1');
const PORT = getenvInt('EXEC_SIM_PORT', 9999);

const server = net.createServer((socket) => {
  socket.setNoDelay(true);

  const peer = `${socket.remoteAddress}:${socket.remotePort}`;
  process.stdout.write(`[execution-simulator] connected peer=${peer} at=${nowIso()}\n`);

  let buf = '';

  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');

    while (true) {
      const idx = buf.indexOf('\n');
      if (idx < 0) break;
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);

      const ord = normalizeOrder(line);
      if (!ord) continue;

      process.stdout.write(
        JSON.stringify(
          {
            at: nowIso(),
            peer,
            kind: 'order_received',
            order: {
              type: ord.type,
              side: ord.side ?? null,
              symbol: ord.symbol ?? null,
              qty: ord.qty ?? null,
              price: ord.price ?? null,
              clientOrderId: ord.clientOrderId ?? null,
              ts: ord.ts ?? null,
              raw: ord.raw,
            },
          }
        ) + '\n'
      );

      const ack = {
        type: 'ack',
        ts: Date.now(),
        receivedAt: nowIso(),
        status: 'SIMULATED',
        clientOrderId: ord.clientOrderId ?? null,
      };
      try {
        socket.write(JSON.stringify(ack) + '\n');
      } catch {
        return;
      }
    }
  });

  socket.on('close', () => {
    process.stdout.write(`[execution-simulator] disconnected peer=${peer} at=${nowIso()}\n`);
  });

  socket.on('error', (err) => {
    process.stderr.write(`[execution-simulator] socket error peer=${peer} err=${err?.message || String(err)}\n`);
  });
});

server.on('error', (err) => {
  process.stderr.write(`[execution-simulator] server error err=${err?.message || String(err)}\n`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`[execution-simulator] listening host=${HOST} port=${PORT} at=${nowIso()}\n`);
});

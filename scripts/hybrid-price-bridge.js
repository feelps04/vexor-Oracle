const net = require('node:net');
const { Kafka, logLevel } = require('kafkajs');

function getenv(name, defv) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : defv;
}

function getenvInt(name, defv) {
  const v = process.env[name];
  const n = Number(v);
  return Number.isFinite(n) ? n : defv;
}

function getenvFloat(name, defv) {
  const v = process.env[name];
  const n = Number(v);
  return Number.isFinite(n) ? n : defv;
}

function nowIso() {
  return new Date().toISOString();
}

function parsePrice(event) {
  const p = Number(event?.priceBRL ?? event?.price ?? event?.last ?? event?.close);
  return Number.isFinite(p) && p > 0 ? p : null;
}

function toFixLike({ side, qty, price, symbol, clOrdId }) {
  const map = {
    35: 'D',
    11: String(clOrdId),
    55: String(symbol),
    54: side === 'BUY' ? '1' : '2',
    38: String(qty),
    44: String(price),
    60: nowIso(),
  };
  const parts = [];
  for (const k of Object.keys(map)) parts.push(`${k}=${map[k]}`);
  return parts.join('|') + '\n';
}

async function sendOrderTcp(host, port, line) {
  await new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port }, () => {
      try {
        sock.write(line);
        sock.end();
      } catch (err) {
        reject(err);
      }
    });
    sock.setTimeout(2000);
    sock.on('data', () => {
      // ignore ack payload
    });
    sock.on('timeout', () => {
      try {
        sock.destroy(new Error('timeout'));
      } catch {
        // ignore
      }
    });
    sock.on('error', (err) => reject(err));
    sock.on('close', () => resolve());
  });
}

const EXEC_HOST = getenv('EXEC_SIM_HOST', '127.0.0.1');
const EXEC_PORT = getenvInt('EXEC_SIM_PORT', 9999);

const KAFKA_BROKERS = getenv('KAFKA_BROKERS', 'localhost:29092')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const TOPIC = getenv('STOCKS_TICK_TOPIC', 'stocks.ticker');

const SYMBOL = getenv('SYMBOL', 'WINJ26').trim().toUpperCase();
const QTY = getenvInt('QTY', 1);

const BUY_BELOW = getenvFloat('BUY_BELOW', NaN);
const COOLDOWN_MS = getenvInt('COOLDOWN_MS', 30_000);
const MIN_TICK_DELTA_MS = getenvInt('MIN_TICK_DELTA_MS', 0);

const CLIENT_ID = getenv('BRIDGE_CLIENT_ID', 'hybrid-price-bridge');
const GROUP_ID = getenv('BRIDGE_GROUP_ID', `${CLIENT_ID}-${Date.now()}`);

let lastOrderAt = 0;
let lastTickAtBySymbol = new Map();

function shouldBuy(price) {
  if (Number.isFinite(BUY_BELOW) && BUY_BELOW > 0) {
    return price <= BUY_BELOW;
  }
  return false;
}

async function main() {
  process.stdout.write(
    `[hybrid-bridge] starting at=${nowIso()} symbol=${SYMBOL} qty=${QTY} buyBelow=${Number.isFinite(BUY_BELOW) ? BUY_BELOW : 'disabled'} kafka=${KAFKA_BROKERS.join(',')} exec=${EXEC_HOST}:${EXEC_PORT}\n`
  );

  const kafka = new Kafka({
    clientId: CLIENT_ID,
    brokers: KAFKA_BROKERS,
    logLevel: logLevel.NOTHING,
    retry: { retries: 0 },
  });

  const consumer = kafka.consumer({ groupId: GROUP_ID });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const raw = message.value ? message.value.toString('utf8') : '';
      if (!raw) return;

      let evt = null;
      try {
        evt = JSON.parse(raw);
      } catch {
        return;
      }

      const sym = String(evt?.symbol ?? '').trim().toUpperCase();
      if (!sym) return;
      if (sym !== SYMBOL) return;

      const price = parsePrice(evt);
      if (price == null) return;

      const now = Date.now();
      const lastTickAt = lastTickAtBySymbol.get(sym) ?? 0;
      if (MIN_TICK_DELTA_MS > 0 && lastTickAt > 0 && now - lastTickAt < MIN_TICK_DELTA_MS) {
        return;
      }
      lastTickAtBySymbol.set(sym, now);

      process.stdout.write(`[hybrid-bridge] tick at=${nowIso()} symbol=${sym} price=${price}\n`);

      if (!shouldBuy(price)) return;

      if (COOLDOWN_MS > 0 && lastOrderAt > 0 && now - lastOrderAt < COOLDOWN_MS) {
        process.stdout.write(`[hybrid-bridge] buy signal but cooldown active remainingMs=${COOLDOWN_MS - (now - lastOrderAt)}\n`);
        return;
      }

      const clOrdId = `${CLIENT_ID}-${now}`;
      const fixLine = toFixLike({ side: 'BUY', qty: QTY, price, symbol: sym, clOrdId });

      try {
        await sendOrderTcp(EXEC_HOST, EXEC_PORT, fixLine);
        lastOrderAt = now;
        process.stdout.write(`[hybrid-bridge] order_sent at=${nowIso()} clOrdId=${clOrdId} symbol=${sym} qty=${QTY} price=${price}\n`);
      } catch (err) {
        process.stderr.write(`[hybrid-bridge] order_send_failed at=${nowIso()} err=${err?.message || String(err)}\n`);
      }
    },
  });

  const shutdown = async () => {
    try {
      await consumer.disconnect();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(`[hybrid-bridge] fatal err=${err?.message || String(err)}\n`);
  process.exit(1);
});

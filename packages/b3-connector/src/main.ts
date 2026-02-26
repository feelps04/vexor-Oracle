import dgram from 'node:dgram';
import { Kafka } from 'kafkajs';
import { createLogger } from '@transaction-auth-engine/shared';

const TOPIC_STOCKS_TICKER = process.env.B3_KAFKA_TOPIC_STOCKS_TICKER ?? 'stocks.ticker';
const TOPIC_OPPORTUNITIES = process.env.B3_KAFKA_TOPIC_OPPORTUNITIES ?? 'opportunities.buy';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');

const MULTICAST_ADDR = process.env.B3_MULTICAST_ADDR ?? '233.252.14.1';
const PORT = Number(process.env.B3_UDP_PORT ?? '20051');
const INTERFACE = process.env.B3_INTERFACE ?? '0.0.0.0';

const CHANNELS_ENV = String(process.env.B3_CHANNELS ?? '').trim();
const SIMULATION_MODE = String(process.env.B3_SIMULATION_MODE ?? '').trim().toLowerCase() === 'true';
const SIMULATION_INTERVAL_MS = Number(process.env.B3_SIMULATION_INTERVAL_MS ?? '100');

const CLIENT_ID = process.env.B3_CLIENT_ID ?? 'b3-connector';

const SYMBOLS_ALLOWLIST = new Set(
  String(process.env.B3_SYMBOLS ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);

const HEALTH_LOG_INTERVAL_MS = Number(process.env.B3_HEALTH_LOG_INTERVAL_MS ?? '5000');
const SPIKE_MULTIPLIER = Number(process.env.B3_SPIKE_MULTIPLIER ?? '5');

type StockTickEvent = {
  type: 'tick';
  source: 'b3-udp';
  symbol?: string;
  price?: number;
  ts: number;
  channel?: string;
  seq?: number;
  rawHex: string;
  udp: {
    address: string;
    port: number;
    size: number;
  };
};

type ChannelConf = { multicastAddr: string; port: number };

function parseChannels(): ChannelConf[] {
  if (!CHANNELS_ENV) {
    return [{ multicastAddr: MULTICAST_ADDR, port: PORT }];
  }
  const out: ChannelConf[] = [];
  for (const item of CHANNELS_ENV.split(',')) {
    const v = item.trim();
    if (!v) continue;
    const [addrRaw, portRaw] = v.split(':');
    const addr = String(addrRaw ?? '').trim();
    const port = Number(String(portRaw ?? '').trim());
    if (!addr || !Number.isFinite(port) || port <= 0) continue;
    out.push({ multicastAddr: addr, port });
  }
  return out.length > 0 ? out : [{ multicastAddr: MULTICAST_ADDR, port: PORT }];
}

function tryExtractSymbolFromAscii(buf: Buffer): string | undefined {
  const s = buf.toString('latin1');
  const m = s.match(/\b[A-Z]{4}\d{1,2}\b/);
  if (!m) return undefined;
  return m[0].toUpperCase();
}

function isAllowedSymbol(symbol: string | undefined): boolean {
  if (!symbol) return SYMBOLS_ALLOWLIST.size === 0;
  if (SYMBOLS_ALLOWLIST.size === 0) return true;
  return SYMBOLS_ALLOWLIST.has(symbol);
}

async function main(): Promise<void> {
  const logger = createLogger('b3-connector');

  const kafka = new Kafka({ clientId: CLIENT_ID, brokers: KAFKA_BROKERS });
  const producer = kafka.producer();
  await producer.connect();

  const sockets: dgram.Socket[] = [];

  let totalMessages = 0;
  let totalBytes = 0;
  let lastTotalMessages = 0;
  let lastLogTs = Date.now();

  const perSymbolRate = new Map<string, number>();
  const perSymbolRatePrev = new Map<string, number>();

  const healthTimer = setInterval(async () => {
    const now = Date.now();
    const dtSec = Math.max(1, (now - lastLogTs) / 1000);

    const msgDelta = totalMessages - lastTotalMessages;
    const mps = msgDelta / dtSec;

    logger.info(
      {
        udp: { channels: parseChannels(), iface: INTERFACE, simulation: SIMULATION_MODE },
        kafka: { brokers: KAFKA_BROKERS },
        totals: { messages: totalMessages, bytes: totalBytes },
        rate: { mps: Number(mps.toFixed(2)) },
      },
      'b3-connector health'
    );

    for (const [sym, count] of perSymbolRate.entries()) {
      const prev = perSymbolRatePrev.get(sym) ?? 0;
      perSymbolRatePrev.set(sym, count);

      if (prev > 0 && count >= prev * SPIKE_MULTIPLIER) {
        const alert = {
          type: 'behavior.alert',
          source: 'b3-connector',
          symbol: sym,
          note: 'ALTA VOLATILIDADE / FLUXO: spike de mensagens no feed UDP (possível agressão no book)',
          windowMs: HEALTH_LOG_INTERVAL_MS,
          prevCount: prev,
          curCount: count,
          ts: now,
        };
        try {
          await producer.send({
            topic: TOPIC_OPPORTUNITIES,
            messages: [{ key: sym, value: JSON.stringify(alert) }],
          });
        } catch (err) {
          logger.warn({ err, sym }, 'Failed to publish behavior alert');
        }
      }

      perSymbolRate.set(sym, 0);
    }

    lastTotalMessages = totalMessages;
    lastLogTs = now;
  }, HEALTH_LOG_INTERVAL_MS);

  const publishTick = async (event: StockTickEvent): Promise<void> => {
    try {
      await producer.send({
        topic: TOPIC_STOCKS_TICKER,
        messages: [{ key: event.symbol ?? 'b3', value: JSON.stringify(event) }],
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to publish stocks.ticker');
    }
  };

  const onPacket = async (msg: Buffer, rinfo: { address: string; port: number; size: number }, channelLabel: string) => {
    totalMessages += 1;
    totalBytes += msg.length;

    const symbol = tryExtractSymbolFromAscii(msg);
    if (!isAllowedSymbol(symbol)) return;

    if (symbol) {
      perSymbolRate.set(symbol, (perSymbolRate.get(symbol) ?? 0) + 1);
    }

    const event: StockTickEvent = {
      type: 'tick',
      source: 'b3-udp',
      symbol,
      ts: Date.now(),
      channel: channelLabel,
      seq: undefined,
      rawHex: msg.toString('hex'),
      udp: {
        address: rinfo.address,
        port: rinfo.port,
        size: rinfo.size,
      },
    };

    await publishTick(event);
  };

  let simulationTimer: NodeJS.Timeout | undefined;
  if (SIMULATION_MODE) {
    const baseSymbol = (process.env.B3_SIMULATION_SYMBOL ?? 'PETR4').trim().toUpperCase() || 'PETR4';
    simulationTimer = setInterval(() => {
      const payload = JSON.stringify({
        symbol: baseSymbol,
        price: 35 + Math.random(),
        volume: Math.floor(Math.random() * 1000),
        isSimulation: true,
        ts: Date.now(),
      });
      void onPacket(Buffer.from(payload, 'utf8'), { address: 'simulation', port: 0, size: payload.length }, 'SIMULATION');
    }, Math.max(10, SIMULATION_INTERVAL_MS));

    logger.info(
      {
        simulation: true,
        intervalMs: SIMULATION_INTERVAL_MS,
        symbol: baseSymbol,
      },
      'b3-connector simulation mode enabled'
    );
  }

  if (!SIMULATION_MODE) {
    const channels = parseChannels();
    for (const ch of channels) {
      const channelLabel = `${ch.multicastAddr}:${ch.port}`;
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sockets.push(socket);

      socket.on('error', (err) => {
        logger.error({ err, channel: channelLabel }, 'UDP socket error');
      });

      socket.on('listening', () => {
        try {
          socket.addMembership(ch.multicastAddr, INTERFACE);
        } catch (err) {
          logger.error(
            { err, multicast: ch.multicastAddr, port: ch.port, iface: INTERFACE },
            'Failed to join multicast group'
          );
          return;
        }
        const addr = socket.address();
        logger.info({ addr, multicast: ch.multicastAddr, port: ch.port, iface: INTERFACE }, 'UDP listener ready');
      });

      socket.on('message', (msg, rinfo) => {
        void onPacket(msg, rinfo, channelLabel);
      });

      socket.bind(ch.port, () => {
        try {
          socket.setBroadcast(true);
          socket.setMulticastLoopback(false);
          socket.setMulticastTTL(128);
        } catch {
          // ignore
        }
      });
    }
  }

  const shutdown = async (): Promise<void> => {
    clearInterval(healthTimer);
    if (simulationTimer) clearInterval(simulationTimer);
    for (const s of sockets) {
      try {
        s.close();
      } catch {
        // ignore
      }
    }
    await producer.disconnect();
    logger.info('b3-connector stopped');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

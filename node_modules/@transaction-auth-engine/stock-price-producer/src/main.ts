import fs from 'node:fs/promises';
import { Kafka } from 'kafkajs';
import { createLogger } from '@transaction-auth-engine/shared';
import { openMmf, openMmfWithConfig, closeMmf, readAllRecords, readAllRecordsWithConfig, type MmfRecord, type MmfConfig } from './mmf';

const TOPIC = 'stocks.ticker';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:29092').split(',');

const BOOK_FILE_PATH =
  process.env.MT5_BOOK_FILE ??
  'C:/Users/SEU_USUARIO/AppData/Roaming/MetaQuotes/Terminal/.../MQL5/Files/B3_Book_Data.bin';

const POLL_MS = Number(process.env.MT5_POLL_MS ?? 10);
const FORCE_PUBLISH = (process.env.FORCE_PUBLISH ?? 'false') === 'true';
const FORCE_PUBLISH_EVERY_MS = Number(process.env.FORCE_PUBLISH_EVERY_MS ?? 1000);
const HEADER_BYTES = Number(process.env.MT5_FILE_HEADER_BYTES ?? 0);
const SYMBOL_BYTES = Number(process.env.MT5_SYMBOL_BYTES ?? 32);
const HAS_DATETIME = (process.env.MT5_HAS_DATETIME ?? '1') !== '0';
const MIN_PRICE = Number(process.env.MT5_MIN_PRICE ?? 0.01);
const SYMBOL_REGEX = new RegExp(process.env.MT5_SYMBOL_REGEX ?? '^[A-Z0-9]{4,12}$');
const START_FROM_END = (process.env.MT5_START_FROM_END ?? '0') === '1';
const TAIL_RECORDS = Number(process.env.MT5_TAIL_RECORDS ?? 5000);

function parseJsonObject(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(String(raw));
    if (!v || typeof v !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const kk = String(k || '').trim().toUpperCase();
      const vv = String(val || '').trim().toUpperCase();
      if (kk && vv) out[kk] = vv;
    }
    return out;
  } catch {
    return {};
  }
}

const FUTURES_CURRENT_CONTRACTS = parseJsonObject(process.env.B3_FUTURES_CURRENT_CONTRACTS ?? process.env.FUTURES_CURRENT_CONTRACTS);

function remapSymbol(symbol: string): string {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return s;
  // If the EA emits generic future roots (WIN/WDO/IND/DOL), remap to the current contract.
  // We only remap exact roots (or root plus a single non-alphanumeric suffix) to avoid
  // accidentally changing already-contracted symbols (e.g. WINJ26).
  for (const [root, contract] of Object.entries(FUTURES_CURRENT_CONTRACTS)) {
    if (!root || !contract) continue;
    if (s === root) return contract;
    if (s.startsWith(root) && s.length === root.length + 1) {
      const suf = s.slice(root.length);
      if (/[^A-Z0-9]/.test(suf)) return contract;
    }
  }
  return s;
}

type WatchMethod = 'poll' | 'mmf';
const MT5_WATCH_METHOD = (process.env.MT5_WATCH_METHOD ?? 'poll') as WatchMethod;

type LayoutMode = 'full_struct' | 'single_i64' | 'offsets';
const MT5_LAYOUT = (process.env.MT5_LAYOUT ?? 'full_struct') as LayoutMode;
const PRICE_SCALE = Number(process.env.MT5_PRICE_SCALE ?? 1);
const FORCE_SNAPSHOT_EVERY_MS = Number(
  process.env.MT5_FORCE_SNAPSHOT_EVERY_MS ?? (MT5_LAYOUT === 'single_i64' ? 1000 : 0)
);

type NumberEncoding = 'double_le' | 'float_le' | 'int64_le' | 'uint64_le' | 'int32_le' | 'uint32_le';
const PRICE_ENCODING = (process.env.MT5_PRICE_ENCODING ?? 'double_le') as NumberEncoding;
const SINGLE_PRICE_ENCODING = (process.env.MT5_SINGLE_PRICE_ENCODING ?? 'int64_le') as NumberEncoding;
const SINGLE_SYMBOL_AT_END = (process.env.MT5_SINGLE_SYMBOL_AT_END ?? '0') === '1';
const SINGLE_PRICE_OFFSET_BYTES = Number(process.env.MT5_SINGLE_PRICE_OFFSET_BYTES ?? SYMBOL_BYTES);
const VOLUME_ENCODING = (process.env.MT5_VOLUME_ENCODING ?? 'int64_le') as NumberEncoding;
const TIME_ENCODING = (process.env.MT5_TIME_ENCODING ?? 'int64_le') as NumberEncoding;

const OFFSETS_BID_ENCODING = (process.env.MT5_OFFSETS_BID_ENCODING ?? PRICE_ENCODING) as NumberEncoding;
const OFFSETS_ASK_ENCODING = (process.env.MT5_OFFSETS_ASK_ENCODING ?? PRICE_ENCODING) as NumberEncoding;
const OFFSETS_VOLUME_ENCODING = (process.env.MT5_OFFSETS_VOLUME_ENCODING ?? VOLUME_ENCODING) as NumberEncoding;
const OFFSETS_TIME_ENCODING = (process.env.MT5_OFFSETS_TIME_ENCODING ?? TIME_ENCODING) as NumberEncoding;

function byteLen(enc: NumberEncoding): number {
  switch (enc) {
    case 'double_le':
      return 8;
    case 'float_le':
      return 4;
    case 'int64_le':
    case 'uint64_le':
      return 8;
    case 'int32_le':
    case 'uint32_le':
      return 4;
    default:
      return 8;
  }
}

const BID_OFFSET_BYTES = Number(process.env.MT5_BID_OFFSET_BYTES ?? SYMBOL_BYTES);
const ASK_OFFSET_BYTES = Number(process.env.MT5_ASK_OFFSET_BYTES ?? SYMBOL_BYTES + 8);
const VOLUME_OFFSET_BYTES = Number(process.env.MT5_VOLUME_OFFSET_BYTES ?? SYMBOL_BYTES + 16);
const TIME_OFFSET_BYTES_RAW = process.env.MT5_TIME_OFFSET_BYTES;
const TIME_OFFSET_BYTES =
  TIME_OFFSET_BYTES_RAW == null
    ? NaN
    : (() => {
        const v = Number(TIME_OFFSET_BYTES_RAW);
        return Number.isFinite(v) && v >= 0 ? v : NaN;
      })();

function applyScale(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(PRICE_SCALE) || PRICE_SCALE <= 0 || PRICE_SCALE === 1) return value;
  return value / PRICE_SCALE;
}

function readNumber(buf: Buffer, offset: number, enc: NumberEncoding): number {
  switch (enc) {
    case 'double_le':
      return buf.readDoubleLE(offset);
    case 'float_le':
      return buf.readFloatLE(offset);
    case 'int64_le': {
      const v = buf.readBigInt64LE(offset);
      return Number(v);
    }
    case 'uint64_le': {
      const v = buf.readBigUInt64LE(offset);
      return Number(v);
    }
    case 'int32_le':
      return buf.readInt32LE(offset);
    case 'uint32_le':
      return buf.readUInt32LE(offset);
    default:
      return buf.readDoubleLE(offset);
  }
}

function decodeSymbol(raw: Buffer): string {
  const nul = raw.indexOf(0);
  const slice = nul >= 0 ? raw.subarray(0, nul) : raw;
  return slice.toString('ascii').trim().toUpperCase();
}

function isValidSymbol(symbol: string): boolean {
  if (!symbol) return false;
  // Reject non-printable leftovers that sometimes appear when misaligned.
  for (let i = 0; i < symbol.length; i += 1) {
    const c = symbol.charCodeAt(i);
    if (c < 32 || c > 126) return false;
  }
  return SYMBOL_REGEX.test(symbol);
}

type BookRecord = { symbol: string; bid: number; ask: number; volume: number; datetime: number };

function parseRecord(buf: Buffer, offset: number): BookRecord | null {
  if (offset + RECORD_BYTES > buf.length) return null;
  const symbolOffset = SINGLE_SYMBOL_AT_END ? offset + (RECORD_BYTES - SYMBOL_BYTES) : offset;
  const symBuf = buf.subarray(symbolOffset, symbolOffset + SYMBOL_BYTES);
  const symbol = decodeSymbol(symBuf);
  if (!isValidSymbol(symbol)) return null;

  let o = offset + SYMBOL_BYTES;

  if (MT5_LAYOUT === 'single_i64') {
    o = offset + SINGLE_PRICE_OFFSET_BYTES;
    const priceRaw = readNumber(buf, o, SINGLE_PRICE_ENCODING);
    const price = applyScale(priceRaw);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { symbol, bid: price, ask: price, volume: 0, datetime: 0 };
  }

  if (MT5_LAYOUT === 'offsets') {
    const bid = applyScale(readNumber(buf, offset + BID_OFFSET_BYTES, OFFSETS_BID_ENCODING));
    const ask = applyScale(readNumber(buf, offset + ASK_OFFSET_BYTES, OFFSETS_ASK_ENCODING));
    const volume = readNumber(buf, offset + VOLUME_OFFSET_BYTES, OFFSETS_VOLUME_ENCODING);
    const datetime =
      HAS_DATETIME && Number.isFinite(TIME_OFFSET_BYTES)
        ? readNumber(buf, offset + TIME_OFFSET_BYTES, OFFSETS_TIME_ENCODING)
        : 0;

    if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
    return {
      symbol,
      bid,
      ask,
      volume: Number.isFinite(volume) ? volume : 0,
      datetime: Number.isFinite(datetime) ? datetime : 0,
    };
  }

  const bid = applyScale(readNumber(buf, o, PRICE_ENCODING));
  o += byteLen(PRICE_ENCODING);
  const ask = applyScale(readNumber(buf, o, PRICE_ENCODING));
  o += byteLen(PRICE_ENCODING);
  const volume = readNumber(buf, o, VOLUME_ENCODING);
  o += byteLen(VOLUME_ENCODING);
  const datetime = HAS_DATETIME ? readNumber(buf, o, TIME_ENCODING) : 0;

  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  return {
    symbol,
    bid,
    ask,
    volume: Number.isFinite(volume) ? volume : 0,
    datetime: Number.isFinite(datetime) ? datetime : 0,
  };
}

function isPlausibleQuote(rec: BookRecord): boolean {
  if (!Number.isFinite(rec.bid) || !Number.isFinite(rec.ask)) return false;
  if (rec.bid < MIN_PRICE || rec.ask < MIN_PRICE) return false;
  if (rec.ask < rec.bid) return false;
  if (rec.bid > 1_000_000 || rec.ask > 1_000_000) return false;

  // datetime: accept either seconds or ms since epoch, but must be within [2000, 2100]
  const t = rec.datetime;
  if (!Number.isFinite(t) || t <= 0) return true; // allow missing time
  const ms = t < 10_000_000_000 ? t * 1000 : t;
  const year2000 = 946684800000;
  const year2100 = 4102444800000;
  if (ms < year2000 || ms > year2100) return false;
  return true;
}

const RECORD_BYTES_CALC =
  MT5_LAYOUT === 'single_i64'
    ? SYMBOL_BYTES + 8
    : MT5_LAYOUT === 'offsets'
      ? Math.max(
          SYMBOL_BYTES,
          BID_OFFSET_BYTES + byteLen(OFFSETS_BID_ENCODING),
          ASK_OFFSET_BYTES + byteLen(OFFSETS_ASK_ENCODING),
          VOLUME_OFFSET_BYTES + byteLen(OFFSETS_VOLUME_ENCODING),
          (Number.isFinite(TIME_OFFSET_BYTES) ? TIME_OFFSET_BYTES + byteLen(OFFSETS_TIME_ENCODING) : 0)
        )
      : SYMBOL_BYTES +
        byteLen(PRICE_ENCODING) * 2 +
        byteLen(VOLUME_ENCODING) +
        (HAS_DATETIME ? byteLen(TIME_ENCODING) : 0);
const RECORD_BYTES = Number(process.env.MT5_RECORD_BYTES ?? process.env.MT5_SINGLE_RECORD_BYTES_DEFAULT ?? RECORD_BYTES_CALC);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MMF_WATCHDOG_STALE_MS = Number(process.env.MMF_WATCHDOG_STALE_MS ?? 3000);
const MMF_LATENCY_WARN_MS = Number(process.env.MMF_LATENCY_WARN_MS ?? 250);
const MMF_OBS_LOG_MS = Number(process.env.MMF_OBS_LOG_MS ?? 5000);

const MARKET_INGEST_URL = String(process.env.MARKET_INGEST_URL ?? '').trim();
const MARKET_INGEST_TOKEN = String(process.env.MARKET_INGEST_TOKEN ?? '').trim();
const MARKET_INGEST_BATCH_MAX = Math.max(1, Math.min(5000, Math.trunc(Number(process.env.MARKET_INGEST_BATCH_MAX ?? 250))));
const MARKET_INGEST_FLUSH_MS = Math.max(1, Math.min(1000, Math.trunc(Number(process.env.MARKET_INGEST_FLUSH_MS ?? 50))));

function envTrue(name: string): boolean {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function envFalse(name: string): boolean {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'no' || v === 'off';
}

type MmfRuntimeConfig = {
  mmf: MmfConfig;
  source: string;
};

function parseMmfConfigs(): MmfRuntimeConfig[] {
  const raw = String(process.env.MMF_CONFIGS ?? '').trim();
  if (!raw) {
    return [];
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid MMF_CONFIGS (must be JSON array)');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Invalid MMF_CONFIGS (must be JSON array)');
  }

  const out: MmfRuntimeConfig[] = [];
  for (const item of parsed) {
    const name = String(item?.name ?? '').trim();
    if (!name) continue;

    const source = String(item?.source ?? name).trim();
    const recordBytes = Number(item?.recordBytes ?? 128);
    const recordCount = Number(item?.recordCount ?? 8192);

    const bidOffset = Number(item?.bidOffset ?? 0);
    const askOffset = Number(item?.askOffset ?? 8);
    const volumeOffset = Number(item?.volumeOffset ?? 16);
    const timeOffset = Number(item?.timeOffset ?? 24);
    const hbOffset = Number(item?.hbOffset ?? 36);
    const wfOffset = Number(item?.wfOffset ?? 40);
    const symbolOffset = Number(item?.symbolOffset ?? 44);
    const symbolBytes = Number(item?.symbolBytes ?? 16);

    out.push({
      source,
      mmf: {
        name,
        recordBytes,
        recordCount,
        bidOffset,
        askOffset,
        volumeOffset,
        timeOffset,
        hbOffset,
        wfOffset,
        symbolOffset,
        symbolBytes,
      },
    });
  }
  return out;
}

async function runMmfLoop(params: {
  producer: import('kafkajs').Producer;
  logger: ReturnType<typeof createLogger>;
}): Promise<void> {
  const { producer, logger } = params;
  const topic = process.env.MT5_TOPIC ?? 'stocks.ticker';

  type IngestTick = { symbol: string; priceBRL: number; bid: number; ask: number; ts: number; source: string };
  const ingestBuf: IngestTick[] = [];
  let ingestLastFlushMs = 0;
  let ingestInFlight: Promise<void> | null = null;

  const flushIngest = async (now: number): Promise<void> => {
    if (!MARKET_INGEST_URL) return;
    if (ingestBuf.length === 0) return;
    if (ingestInFlight) return;
    const items = ingestBuf.splice(0, ingestBuf.length);
    ingestLastFlushMs = now;

    ingestInFlight = (async () => {
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (MARKET_INGEST_TOKEN) headers['x-market-ingest-token'] = MARKET_INGEST_TOKEN;

        const res = await fetch(MARKET_INGEST_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ items }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          logger.warn({ status: res.status, body: txt.slice(0, 500) }, 'Market ingest HTTP failed');
        }
      } catch (err) {
        logger.warn({ err }, 'Market ingest HTTP error');
      } finally {
        ingestInFlight = null;
      }
    })();

    await ingestInFlight;
  };

  const FORCE_PUBLISH = (process.env.FORCE_PUBLISH ?? 'false') === 'true';
  const FORCE_PUBLISH_EVERY_MS = Number(process.env.FORCE_PUBLISH_EVERY_MS ?? 1000);

  let stopping = false;
  let lastForcePublishMs = 0;
  let lastLogMs = 0;
  let published = 0;

  const lastSentBySymbol = new Map<string, MmfRecord>();

  const watchdogState = new Map<
    string,
    {
      mmfName?: string;
      lastHb?: number;
      lastHbChangeMs: number;
      lastDataMs: number;
      lastLatencyMaxMs: number;
      emaLatencyMs: number;
      emaAlpha: number;
      lastObsLogMs: number;
      ticksSinceObs: number;
    }
  >();

  const mmfConfigs = parseMmfConfigs();
  const multiMode = mmfConfigs.length > 0;

  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });

  logger.info(
    {
      mode: multiMode ? 'multi_mmf' : 'single_mmf',
      mmfConfigs: multiMode
        ? mmfConfigs.map((c) => ({ name: c.mmf.name, source: c.source, recordBytes: c.mmf.recordBytes, recordCount: c.mmf.recordCount }))
        : undefined,
      mmfName: multiMode ? undefined : (process.env.MMF_NAME ?? 'Local\\B3RAM'),
      mmfRecordBytes: multiMode ? undefined : Number(process.env.MMF_RECORD_BYTES ?? 128),
      mmfRecordCount: multiMode ? undefined : Number(process.env.MMF_RECORD_COUNT ?? 8192),
      pollMs: POLL_MS,
      watchdogStaleMs: MMF_WATCHDOG_STALE_MS,
      latencyWarnMs: MMF_LATENCY_WARN_MS,
      obsLogMs: MMF_OBS_LOG_MS,
      marketIngestUrl: MARKET_INGEST_URL || undefined,
      marketIngestBatchMax: MARKET_INGEST_URL ? MARKET_INGEST_BATCH_MAX : undefined,
      marketIngestFlushMs: MARKET_INGEST_URL ? MARKET_INGEST_FLUSH_MS : undefined,
    },
    'Starting MMF-based MT5 stock price producer'
  );

  const publishRecords = (
    records: MmfRecord[],
    source: string,
    mmfName: string | undefined,
    now: number
  ): { messages: { key: string; value: string }[]; ingest: IngestTick[] } => {
    const messages: { key: string; value: string }[] = [];
    const ingest: IngestTick[] = [];
    const src = String(source || '').trim() || 'unknown';

    const stKey = src;
    let st = watchdogState.get(stKey);
    if (!st) {
      st = {
        mmfName,
        lastHb: undefined,
        lastHbChangeMs: now,
        lastDataMs: now,
        lastLatencyMaxMs: 0,
        emaLatencyMs: 0,
        emaAlpha: 0.2,
        lastObsLogMs: 0,
        ticksSinceObs: 0,
      };
      watchdogState.set(stKey, st);
    } else {
      st.mmfName = mmfName ?? st.mmfName;
    }

    let maxHbInBatch: number | undefined;
    let batchLatencyMax = 0;

    for (const rec of records) {
      const mid = (rec.bid + rec.ask) / 2;
      if (!Number.isFinite(mid) || mid <= 0) continue;

      const stateKey = `${src}:${rec.symbol}`;
      const prev = lastSentBySymbol.get(stateKey);
      if (
        prev &&
        prev.bid === rec.bid &&
        prev.ask === rec.ask &&
        prev.volume === rec.volume &&
        prev.ts === rec.ts
      ) {
        continue;
      }

      lastSentBySymbol.set(stateKey, rec);

      const ts = Number.isFinite(rec.ts) && rec.ts > 0 ? rec.ts : now;

      if (Number.isFinite(rec.hb)) {
        const hb = rec.hb;
        if (maxHbInBatch == null || hb > maxHbInBatch) maxHbInBatch = hb;
      }

      if (Number.isFinite(ts) && ts > 0) {
        const latencyMs = Math.max(0, now - ts);
        if (latencyMs > batchLatencyMax) batchLatencyMax = latencyMs;

        st.ticksSinceObs += 1;
        st.lastLatencyMaxMs = Math.max(st.lastLatencyMaxMs, latencyMs);
        st.emaLatencyMs = st.emaLatencyMs === 0 ? latencyMs : st.emaLatencyMs * (1 - st.emaAlpha) + latencyMs * st.emaAlpha;

        if (MMF_LATENCY_WARN_MS > 0 && latencyMs >= MMF_LATENCY_WARN_MS) {
          logger.warn(
            { source: src, symbol: rec.symbol, latencyMs, ts, now, mmfName },
            'High tick latency detected'
          );
        }
      }

      const payload = JSON.stringify({
        type: 'tick',
        source: src,
        symbol: rec.symbol,
        priceBRL: mid,
        bid: rec.bid,
        ask: rec.ask,
        volume: rec.volume,
        timestamp: new Date(ts).toISOString(),
        ts,
      });

      messages.push({ key: rec.symbol, value: payload });
      ingest.push({ symbol: rec.symbol, priceBRL: mid, bid: rec.bid, ask: rec.ask, ts, source: src });
    }

    if (records.length > 0) {
      st.lastDataMs = now;
    }

    if (maxHbInBatch != null) {
      if (st.lastHb == null) {
        st.lastHb = maxHbInBatch;
        st.lastHbChangeMs = now;
      } else if (maxHbInBatch !== st.lastHb) {
        st.lastHb = maxHbInBatch;
        st.lastHbChangeMs = now;
      }
    }

    st.lastObsLogMs = st.lastObsLogMs || now;
    if (MMF_OBS_LOG_MS > 0 && now - st.lastObsLogMs >= MMF_OBS_LOG_MS) {
      logger.info(
        {
          source: src,
          mmfName: st.mmfName,
          ticks: st.ticksSinceObs,
          emaLatencyMs: Number(st.emaLatencyMs.toFixed(1)),
          latencyMaxMs: st.lastLatencyMaxMs,
          hb: st.lastHb,
        },
        'MMF latency/health'
      );
      st.lastObsLogMs = now;
      st.ticksSinceObs = 0;
      st.lastLatencyMaxMs = 0;
    }

    return { messages, ingest };
  };

  const buildForcePublish = (nowForcePub: number): { messages: { key: string; value: string }[]; ingest: IngestTick[] } => {
    const forceMessages: { key: string; value: string }[] = [];
    const ingest: IngestTick[] = [];
    for (const [stateKey, rec] of lastSentBySymbol.entries()) {
      const mid = (rec.bid + rec.ask) / 2;
      if (!Number.isFinite(mid) || mid <= 0) continue;

      const src = stateKey.split(':', 1)[0] || 'unknown';
      const ts = Number.isFinite(rec.ts) && rec.ts > 0 ? rec.ts : nowForcePub;
      const payload = JSON.stringify({
        type: 'tick',
        source: src,
        symbol: rec.symbol,
        priceBRL: mid,
        bid: rec.bid,
        ask: rec.ask,
        volume: rec.volume,
        timestamp: new Date(ts).toISOString(),
        ts,
      });
      forceMessages.push({ key: rec.symbol, value: payload });
      ingest.push({ symbol: rec.symbol, priceBRL: mid, bid: rec.bid, ask: rec.ask, ts, source: src });
    }
    return { messages: forceMessages, ingest };
  };

  if (!multiMode) {
    while (!stopping) {
      let mmf = null;
      try {
        mmf = openMmf();
      } catch (err) {
        const backoff = 1000;
        logger.warn({ err }, 'Failed to open MMF; retrying');
        await sleep(backoff);
        continue;
      }

      try {
        while (!stopping) {
          const now = Date.now();
          const records = readAllRecords(mmf.view);
          const src = process.env.MMF_SOURCE ?? 'genial';
          const mmfName = process.env.MMF_NAME ?? 'Local\\B3RAM';
          const pub = publishRecords(records, src, mmfName, now);

          const st = watchdogState.get(String(src || '').trim() || 'unknown');
          if (st && MMF_WATCHDOG_STALE_MS > 0) {
            const staleHb = now - st.lastHbChangeMs >= MMF_WATCHDOG_STALE_MS;
            const staleData = now - st.lastDataMs >= MMF_WATCHDOG_STALE_MS;
            if (staleHb && staleData) {
              logger.warn(
                { source: src, mmfName, staleMs: MMF_WATCHDOG_STALE_MS, lastHb: st.lastHb, lastHbChangeMs: st.lastHbChangeMs, lastDataMs: st.lastDataMs },
                'MMF watchdog stale; reopening MMF'
              );
              throw new Error('MMF watchdog stale');
            }
          }

          if (MARKET_INGEST_URL && pub.ingest.length > 0) {
            ingestBuf.push(...pub.ingest);
            if (ingestBuf.length >= MARKET_INGEST_BATCH_MAX || now - ingestLastFlushMs >= MARKET_INGEST_FLUSH_MS) {
              await flushIngest(now);
            }
          }

          if (pub.messages.length > 0) {
            await producer.send({ topic, messages: pub.messages });
            published += pub.messages.length;
          }

          if (FORCE_PUBLISH && lastSentBySymbol.size > 0 && FORCE_PUBLISH_EVERY_MS > 0) {
            const nowForcePub = Date.now();
            if (nowForcePub - lastForcePublishMs >= FORCE_PUBLISH_EVERY_MS) {
              lastForcePublishMs = nowForcePub;

              const forcePub = buildForcePublish(nowForcePub);

              if (MARKET_INGEST_URL && forcePub.ingest.length > 0) {
                ingestBuf.push(...forcePub.ingest);
                await flushIngest(nowForcePub);
              }

              if (forcePub.messages.length > 0) {
                await producer.send({ topic, messages: forcePub.messages });
                published += forcePub.messages.length;
              }
            }
          }

          const nowLog = Date.now();
          if (nowLog - lastLogMs > 5000) {
            lastLogMs = nowLog;
            logger.info(
              { published, symbols: lastSentBySymbol.size },
              'MMF MT5 producer idle or steady state'
            );
          }

          await sleep(POLL_MS);
        }
      } catch (err) {
        logger.warn({ err }, 'Error reading from MMF; reopening');
      } finally {
        closeMmf(mmf);
      }
    }

    return;
  }

  while (!stopping) {
    const mmfViews: Array<{ cfg: MmfRuntimeConfig; view: ReturnType<typeof openMmfWithConfig> }>
      = [];

    try {
      for (const cfg of mmfConfigs) {
        mmfViews.push({ cfg, view: openMmfWithConfig(cfg.mmf) });
      }
    } catch (err) {
      for (const v of mmfViews) closeMmf(v.view);
      const backoff = 1000;
      logger.warn({ err }, 'Failed to open one or more MMFs; retrying');
      await sleep(backoff);
      continue;
    }

    try {
      while (!stopping) {
        const now = Date.now();
        const messages: { key: string; value: string }[] = [];
        const ingestTicks: IngestTick[] = [];

        for (const v of mmfViews) {
          const records = readAllRecordsWithConfig(v.view.view, v.cfg.mmf);
          const pub = publishRecords(records, v.cfg.source, v.cfg.mmf.name, now);
          messages.push(...pub.messages);
          ingestTicks.push(...pub.ingest);

          const st = watchdogState.get(String(v.cfg.source || '').trim() || 'unknown');
          if (st && MMF_WATCHDOG_STALE_MS > 0) {
            const staleHb = now - st.lastHbChangeMs >= MMF_WATCHDOG_STALE_MS;
            const staleData = now - st.lastDataMs >= MMF_WATCHDOG_STALE_MS;
            if (staleHb && staleData) {
              logger.warn(
                {
                  source: v.cfg.source,
                  mmfName: v.cfg.mmf.name,
                  staleMs: MMF_WATCHDOG_STALE_MS,
                  lastHb: st.lastHb,
                  lastHbChangeMs: st.lastHbChangeMs,
                  lastDataMs: st.lastDataMs,
                },
                'MMF watchdog stale; reopening MMFs'
              );
              throw new Error('MMF watchdog stale');
            }
          }
        }

        if (MARKET_INGEST_URL && ingestTicks.length > 0) {
          ingestBuf.push(...ingestTicks);
          if (ingestBuf.length >= MARKET_INGEST_BATCH_MAX || now - ingestLastFlushMs >= MARKET_INGEST_FLUSH_MS) {
            await flushIngest(now);
          }
        }

        if (messages.length > 0) {
          await producer.send({ topic, messages });
          published += messages.length;
        }

        if (FORCE_PUBLISH && lastSentBySymbol.size > 0 && FORCE_PUBLISH_EVERY_MS > 0) {
          const nowForcePub = Date.now();
          if (nowForcePub - lastForcePublishMs >= FORCE_PUBLISH_EVERY_MS) {
            lastForcePublishMs = nowForcePub;

            const forcePub = buildForcePublish(nowForcePub);

            if (MARKET_INGEST_URL && forcePub.ingest.length > 0) {
              ingestBuf.push(...forcePub.ingest);
              await flushIngest(nowForcePub);
            }

            if (forcePub.messages.length > 0) {
              await producer.send({ topic, messages: forcePub.messages });
              published += forcePub.messages.length;
            }
          }
        }

        const nowLog = Date.now();
        if (nowLog - lastLogMs > 5000) {
          lastLogMs = nowLog;
          logger.info(
            { published, symbols: lastSentBySymbol.size },
            'MMF MT5 producer idle or steady state'
          );
        }

        await sleep(POLL_MS);
      }
    } catch (err) {
      logger.warn({ err }, 'Error reading from MMFs; reopening');
    } finally {
      await flushIngest(Date.now());
      for (const v of mmfViews) closeMmf(v.view);
    }
  }
}

function isRetryableFsError(err: unknown): boolean {
  const code = (err as any)?.code;
  return code === 'EACCES' || code === 'EPERM' || code === 'EBUSY' || code === 'ENOENT';
}

async function main(): Promise<void> {
  const logger = createLogger('stock-price-producer');

  const marketIngestUrlEnv = String(process.env.MARKET_INGEST_URL ?? '').trim();

  const kafkaDisabled =
    envTrue('KAFKA_DISABLED') ||
    envTrue('DISABLE_KAFKA') ||
    envTrue('SKIP_KAFKA') ||
    envFalse('USE_KAFKA') ||
    Boolean(marketIngestUrlEnv);

  const producer: import('kafkajs').Producer = kafkaDisabled
    ? (({
        async connect() {
          return;
        },
        async disconnect() {
          return;
        },
        async send() {
          return [];
        },
        async sendBatch() {
          return [];
        },
      } as unknown) as import('kafkajs').Producer)
    : (() => {
        const kafka = new Kafka({ clientId: 'stock-price-producer', brokers: KAFKA_BROKERS });
        return kafka.producer();
      })();

  if (!kafkaDisabled && producer.connect) {
    await producer.connect();
  }

  let stopping = false;

  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    try {
      await producer.disconnect();
    } catch {
      // ignore
    }
    logger.info('stock-price-producer stopped');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info(
    {
      bookFile: BOOK_FILE_PATH,
      watchMethod: MT5_WATCH_METHOD,
      pollMs: POLL_MS,
      forceSnapshotEveryMs: FORCE_SNAPSHOT_EVERY_MS,
      forcePublish: FORCE_PUBLISH,
      forcePublishEveryMs: FORCE_PUBLISH_EVERY_MS,
      headerBytes: HEADER_BYTES,
      recordBytes: RECORD_BYTES,
      recordBytesCalc: RECORD_BYTES_CALC,
      symbolBytes: SYMBOL_BYTES,
      hasDatetime: HAS_DATETIME,
      priceEncoding: PRICE_ENCODING,
      singlePriceEncoding: SINGLE_PRICE_ENCODING,
      singleSymbolAtEnd: SINGLE_SYMBOL_AT_END,
      singlePriceOffsetBytes: SINGLE_PRICE_OFFSET_BYTES,
      volumeEncoding: VOLUME_ENCODING,
      layout: MT5_LAYOUT,
      priceScale: PRICE_SCALE,
      futuresCurrentContracts: FUTURES_CURRENT_CONTRACTS,
    },
    'MT5 book-file stock price producer started'
  );

  let offset = HEADER_BYTES;
  let initializedOffset = false;
  let consecutiveErrors = 0;
  let published = 0;
  let lastLogMs = 0;
  let lastMtimeMs = 0;
  let lastForcedSnapshotMs = 0;
  let lastForcePublishMs = 0;
  let lastInvalidWarnMs = 0;

  const lastSentBySymbol = new Map<string, { bid: number; ask: number; volume: number; datetime: number }>();

  type IngestTick = { symbol: string; priceBRL: number; bid: number; ask: number; ts: number; source: string };
  const ingestBuf: IngestTick[] = [];
  let ingestLastFlushMs = 0;
  let ingestInFlight: Promise<void> | null = null;

  const flushIngest = async (now: number): Promise<void> => {
    if (!MARKET_INGEST_URL) return;
    if (ingestBuf.length === 0) return;
    if (ingestInFlight) return;
    const items = ingestBuf.splice(0, ingestBuf.length);
    ingestLastFlushMs = now;

    ingestInFlight = (async () => {
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (MARKET_INGEST_TOKEN) headers['x-market-ingest-token'] = MARKET_INGEST_TOKEN;
        const res = await fetch(MARKET_INGEST_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ items }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          logger.warn({ status: res.status, body: txt.slice(0, 500) }, 'Market ingest HTTP failed');
        }
      } catch (err) {
        logger.warn({ err }, 'Market ingest HTTP error');
      } finally {
        ingestInFlight = null;
      }
    })();

    await ingestInFlight;
  };

  while (!stopping) {
    if (MT5_WATCH_METHOD === 'mmf') {
      await runMmfLoop({ producer, logger });
      break;
    }
    try {
      const st = await fs.stat(BOOK_FILE_PATH);
      const size = st.size;
      const mtimeMs = st.mtimeMs;
      if (size < HEADER_BYTES) {
        offset = HEADER_BYTES;
        await sleep(POLL_MS);
        continue;
      }

      // For huge MT5 files, starting from the end makes the system go live quickly.
      if (!initializedOffset) {
        initializedOffset = true;
        if (START_FROM_END && size > HEADER_BYTES + RECORD_BYTES) {
          const tailBytes = Math.max(0, TAIL_RECORDS) * RECORD_BYTES;
          const start = Math.max(HEADER_BYTES, size - tailBytes);
          offset = start - ((start - HEADER_BYTES) % RECORD_BYTES);
        }
      }

      // Many MT5 EAs rewrite the file in-place (size constant). If mtime changes and we are at EOF,
      // re-read from the beginning as a "snapshot".
      if (mtimeMs > 0 && lastMtimeMs > 0 && mtimeMs !== lastMtimeMs && offset >= size) {
        offset = HEADER_BYTES;
      }
      lastMtimeMs = mtimeMs;

      // Some writers update content without changing mtime in a timely manner (or clock skew). Allow
      // forcing a periodic full reread when we're at EOF.
      if (FORCE_SNAPSHOT_EVERY_MS > 0 && offset >= size) {
        const nowForce = Date.now();
        if (nowForce - lastForcedSnapshotMs >= FORCE_SNAPSHOT_EVERY_MS) {
          lastForcedSnapshotMs = nowForce;
          offset = HEADER_BYTES;
        }
      }

      // If MT5 rewrites/truncates the file, reset offset.
      if (offset > size) offset = HEADER_BYTES;

      const available = size - offset;
      const readable = available - (available % RECORD_BYTES);
      if (readable <= 0) {
        consecutiveErrors = 0;

        if (FORCE_PUBLISH && lastSentBySymbol.size > 0 && FORCE_PUBLISH_EVERY_MS > 0) {
          const nowForcePub = Date.now();
          if (nowForcePub - lastForcePublishMs >= FORCE_PUBLISH_EVERY_MS) {
            lastForcePublishMs = nowForcePub;

            const now = new Date();
            const nowMs = now.getTime();

            const messages: { key: string; value: string }[] = [];
            for (const [symbol, rec] of lastSentBySymbol.entries()) {
              const mid = (rec.bid + rec.ask) / 2;
              if (!Number.isFinite(mid) || mid <= 0) continue;
              const payload = JSON.stringify({
                type: 'tick',
                symbol,
                priceBRL: mid,
                bid: rec.bid,
                ask: rec.ask,
                volume: rec.volume,
                timestamp: now.toISOString(),
                ts: nowMs,
              });
              messages.push({ key: symbol, value: payload });
            }

            if (messages.length > 0) {
              await producer.send({ topic: TOPIC, messages });
              published += messages.length;
            }

            if (MARKET_INGEST_URL && messages.length > 0) {
              const src = String(process.env.MMF_SOURCE ?? process.env.MARKET_SOURCE ?? 'genial').trim() || 'genial';
              const nowMs = now.getTime();
              for (const m of messages) {
                try {
                  const p = JSON.parse(String(m.value || ''));
                  if (!p?.symbol || !Number.isFinite(Number(p?.priceBRL))) continue;
                  ingestBuf.push({
                    symbol: String(p.symbol),
                    priceBRL: Number(p.priceBRL),
                    bid: Number(p.bid),
                    ask: Number(p.ask),
                    ts: Number(p.ts) || nowMs,
                    source: String(p.source ?? src),
                  });
                } catch {
                }
              }
              if (ingestBuf.length >= MARKET_INGEST_BATCH_MAX || Date.now() - ingestLastFlushMs >= MARKET_INGEST_FLUSH_MS) {
                await flushIngest(Date.now());
              }
            }
          }
        }

        const nowMs = Date.now();
        if (nowMs - lastLogMs > 5000) {
          lastLogMs = nowMs;
          logger.info({ size, offset, recordBytes: RECORD_BYTES, published }, 'MT5 book file idle (no full record to read)');
        }
        await sleep(POLL_MS);
        continue;
      }

      const fh = await fs.open(BOOK_FILE_PATH, 'r');
      try {
        const buf = Buffer.allocUnsafe(readable);
        const { bytesRead } = await fh.read(buf, 0, readable, offset);
        if (bytesRead <= 0) {
          consecutiveErrors = 0;
          await sleep(POLL_MS);
          continue;
        }

        const now = new Date();
        const nowMs = now.getTime();

        let batchPublished = 0;
        let invalidLogged = 0;
        const messages: { key: string; value: string }[] = [];
        for (let i = 0; i + RECORD_BYTES <= bytesRead; i += RECORD_BYTES) {
          const rec = parseRecord(buf, i);
          if (!rec) continue;

          const symbol = remapSymbol(rec.symbol);

          if (!isPlausibleQuote(rec)) {
            const nowWarn = Date.now();
            if (invalidLogged < 3 && nowWarn - lastInvalidWarnMs > 2000) {
              lastInvalidWarnMs = nowWarn;
              invalidLogged += 1;
              logger.warn(
                {
                  symbol: rec.symbol,
                  bid: rec.bid,
                  ask: rec.ask,
                  volume: rec.volume,
                  datetime: rec.datetime,
                  recordBytes: RECORD_BYTES,
                  offsetInChunk: i,
                },
                'Discarding implausible MT5 record (check struct/layout/header/record size)'
              );
            }
            continue;
          }

          const mid = (rec.bid + rec.ask) / 2;
          if (!Number.isFinite(mid) || mid <= 0) continue;

          // Prefer timestamp from MT5 record if it looks valid.
          // Many EAs write datetime in milliseconds since epoch. If it's in seconds, convert.
          let recTs = rec.datetime;
          if (Number.isFinite(recTs) && recTs > 0 && recTs < 10_000_000_000) recTs = recTs * 1000;
          if (!Number.isFinite(recTs) || recTs <= 0) recTs = nowMs;

          const prev = lastSentBySymbol.get(symbol);
          if (
            prev &&
            prev.bid === rec.bid &&
            prev.ask === rec.ask &&
            prev.volume === rec.volume &&
            prev.datetime === rec.datetime
          ) {
            continue;
          }
          lastSentBySymbol.set(symbol, {
            bid: rec.bid,
            ask: rec.ask,
            volume: rec.volume,
            datetime: rec.datetime,
          });

          const payload = JSON.stringify({
            type: 'tick',
            symbol,
            priceBRL: mid,
            bid: rec.bid,
            ask: rec.ask,
            volume: rec.volume,
            timestamp: now.toISOString(),
            ts: recTs,
          });

          messages.push({ key: symbol, value: payload });
          published += 1;
          batchPublished += 1;
        }

        if (messages.length > 0) {
          await producer.send({
            topic: TOPIC,
            messages,
          });
        }

        if (MARKET_INGEST_URL && messages.length > 0) {
          const src = String(process.env.MMF_SOURCE ?? process.env.MARKET_SOURCE ?? 'genial').trim() || 'genial';
          for (const m of messages) {
            try {
              const p = JSON.parse(String(m.value || ''));
              if (!p?.symbol || !Number.isFinite(Number(p?.priceBRL))) continue;
              ingestBuf.push({
                symbol: String(p.symbol),
                priceBRL: Number(p.priceBRL),
                bid: Number(p.bid),
                ask: Number(p.ask),
                ts: Number(p.ts) || nowMs,
                source: String(p.source ?? src),
              });
            } catch {
            }
          }
          if (ingestBuf.length >= MARKET_INGEST_BATCH_MAX || Date.now() - ingestLastFlushMs >= MARKET_INGEST_FLUSH_MS) {
            await flushIngest(Date.now());
          }
        }

        offset += bytesRead;
        consecutiveErrors = 0;

        const now2 = Date.now();
        if (batchPublished > 0 && now2 - lastLogMs > 2000) {
          lastLogMs = now2;
          logger.info({ bytesRead, batchPublished, published, offset }, 'Published MT5 ticks batch');
        }
      } finally {
        await fh.close();
      }
    } catch (err) {
      consecutiveErrors += 1;
      const retryable = isRetryableFsError(err);
      const backoff = Math.min(2000, 50 * 2 ** Math.min(8, consecutiveErrors));
      if (retryable) {
        logger.warn({ err, backoff, consecutiveErrors }, 'Failed to read MT5 book file (retrying)');
      } else {
        logger.error({ err }, 'Fatal error reading MT5 book file');
      }
      await sleep(retryable ? backoff : 1000);
    }
  }

  await flushIngest(Date.now());

  // no-op (kept for symmetry with other services)
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

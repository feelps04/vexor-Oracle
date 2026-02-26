"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const kafkajs_1 = require("kafkajs");
const shared_1 = require("@transaction-auth-engine/shared");
const TOPIC = 'stocks.ticker';
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:29092').split(',');
const BOOK_FILE_PATH = process.env.MT5_BOOK_FILE ??
    'C:/Users/SEU_USUARIO/AppData/Roaming/MetaQuotes/Terminal/.../MQL5/Files/B3_Book_Data.bin';
const POLL_MS = Number(process.env.MT5_POLL_MS ?? 10);
const HEADER_BYTES = Number(process.env.MT5_FILE_HEADER_BYTES ?? 0);
const SYMBOL_BYTES = Number(process.env.MT5_SYMBOL_BYTES ?? 32);
const HAS_DATETIME = (process.env.MT5_HAS_DATETIME ?? '1') !== '0';
const MIN_PRICE = Number(process.env.MT5_MIN_PRICE ?? 0.01);
const SYMBOL_REGEX = new RegExp(process.env.MT5_SYMBOL_REGEX ?? '^[A-Z0-9]{4,12}$');
const START_FROM_END = (process.env.MT5_START_FROM_END ?? '0') === '1';
const TAIL_RECORDS = Number(process.env.MT5_TAIL_RECORDS ?? 5000);
const MT5_LAYOUT = (process.env.MT5_LAYOUT ?? 'full_struct');
const PRICE_SCALE = Number(process.env.MT5_PRICE_SCALE ?? 1);
const FORCE_SNAPSHOT_EVERY_MS = Number(process.env.MT5_FORCE_SNAPSHOT_EVERY_MS ?? (MT5_LAYOUT === 'single_i64' ? 1000 : 0));
const PRICE_ENCODING = (process.env.MT5_PRICE_ENCODING ?? 'double_le');
const SINGLE_PRICE_ENCODING = (process.env.MT5_SINGLE_PRICE_ENCODING ?? 'int64_le');
const SINGLE_SYMBOL_AT_END = (process.env.MT5_SINGLE_SYMBOL_AT_END ?? '0') === '1';
const SINGLE_PRICE_OFFSET_BYTES = Number(process.env.MT5_SINGLE_PRICE_OFFSET_BYTES ?? SYMBOL_BYTES);
const VOLUME_ENCODING = (process.env.MT5_VOLUME_ENCODING ?? 'int64_le');
const TIME_ENCODING = (process.env.MT5_TIME_ENCODING ?? 'int64_le');
const OFFSETS_BID_ENCODING = (process.env.MT5_OFFSETS_BID_ENCODING ?? PRICE_ENCODING);
const OFFSETS_ASK_ENCODING = (process.env.MT5_OFFSETS_ASK_ENCODING ?? PRICE_ENCODING);
const OFFSETS_VOLUME_ENCODING = (process.env.MT5_OFFSETS_VOLUME_ENCODING ?? VOLUME_ENCODING);
const OFFSETS_TIME_ENCODING = (process.env.MT5_OFFSETS_TIME_ENCODING ?? TIME_ENCODING);
function byteLen(enc) {
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
const TIME_OFFSET_BYTES = TIME_OFFSET_BYTES_RAW == null
    ? NaN
    : (() => {
        const v = Number(TIME_OFFSET_BYTES_RAW);
        return Number.isFinite(v) && v >= 0 ? v : NaN;
    })();
function applyScale(value) {
    if (!Number.isFinite(value))
        return value;
    if (!Number.isFinite(PRICE_SCALE) || PRICE_SCALE <= 0 || PRICE_SCALE === 1)
        return value;
    return value / PRICE_SCALE;
}
function readNumber(buf, offset, enc) {
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
function decodeSymbol(raw) {
    const nul = raw.indexOf(0);
    const slice = nul >= 0 ? raw.subarray(0, nul) : raw;
    return slice.toString('ascii').trim().toUpperCase();
}
function isValidSymbol(symbol) {
    if (!symbol)
        return false;
    // Reject non-printable leftovers that sometimes appear when misaligned.
    for (let i = 0; i < symbol.length; i += 1) {
        const c = symbol.charCodeAt(i);
        if (c < 32 || c > 126)
            return false;
    }
    return SYMBOL_REGEX.test(symbol);
}
function parseRecord(buf, offset) {
    if (offset + RECORD_BYTES > buf.length)
        return null;
    const symbolOffset = SINGLE_SYMBOL_AT_END ? offset + (RECORD_BYTES - SYMBOL_BYTES) : offset;
    const symBuf = buf.subarray(symbolOffset, symbolOffset + SYMBOL_BYTES);
    const symbol = decodeSymbol(symBuf);
    if (!isValidSymbol(symbol))
        return null;
    let o = offset + SYMBOL_BYTES;
    if (MT5_LAYOUT === 'single_i64') {
        o = offset + SINGLE_PRICE_OFFSET_BYTES;
        const priceRaw = readNumber(buf, o, SINGLE_PRICE_ENCODING);
        const price = applyScale(priceRaw);
        if (!Number.isFinite(price) || price <= 0)
            return null;
        return { symbol, bid: price, ask: price, volume: 0, datetime: 0 };
    }
    if (MT5_LAYOUT === 'offsets') {
        const bid = applyScale(readNumber(buf, offset + BID_OFFSET_BYTES, OFFSETS_BID_ENCODING));
        const ask = applyScale(readNumber(buf, offset + ASK_OFFSET_BYTES, OFFSETS_ASK_ENCODING));
        const volume = readNumber(buf, offset + VOLUME_OFFSET_BYTES, OFFSETS_VOLUME_ENCODING);
        const datetime = HAS_DATETIME && Number.isFinite(TIME_OFFSET_BYTES)
            ? readNumber(buf, offset + TIME_OFFSET_BYTES, OFFSETS_TIME_ENCODING)
            : 0;
        if (!Number.isFinite(bid) || !Number.isFinite(ask))
            return null;
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
    if (!Number.isFinite(bid) || !Number.isFinite(ask))
        return null;
    return {
        symbol,
        bid,
        ask,
        volume: Number.isFinite(volume) ? volume : 0,
        datetime: Number.isFinite(datetime) ? datetime : 0,
    };
}
function isPlausibleQuote(rec) {
    if (!Number.isFinite(rec.bid) || !Number.isFinite(rec.ask))
        return false;
    if (rec.bid < MIN_PRICE || rec.ask < MIN_PRICE)
        return false;
    if (rec.ask < rec.bid)
        return false;
    if (rec.bid > 1_000_000 || rec.ask > 1_000_000)
        return false;
    // datetime: accept either seconds or ms since epoch, but must be within [2000, 2100]
    const t = rec.datetime;
    if (!Number.isFinite(t) || t <= 0)
        return true; // allow missing time
    const ms = t < 10_000_000_000 ? t * 1000 : t;
    const year2000 = 946684800000;
    const year2100 = 4102444800000;
    if (ms < year2000 || ms > year2100)
        return false;
    return true;
}
const RECORD_BYTES_CALC = MT5_LAYOUT === 'single_i64'
    ? SYMBOL_BYTES + 8
    : MT5_LAYOUT === 'offsets'
        ? Math.max(SYMBOL_BYTES, BID_OFFSET_BYTES + byteLen(OFFSETS_BID_ENCODING), ASK_OFFSET_BYTES + byteLen(OFFSETS_ASK_ENCODING), VOLUME_OFFSET_BYTES + byteLen(OFFSETS_VOLUME_ENCODING), (Number.isFinite(TIME_OFFSET_BYTES) ? TIME_OFFSET_BYTES + byteLen(OFFSETS_TIME_ENCODING) : 0))
        : SYMBOL_BYTES +
            byteLen(PRICE_ENCODING) * 2 +
            byteLen(VOLUME_ENCODING) +
            (HAS_DATETIME ? byteLen(TIME_ENCODING) : 0);
const RECORD_BYTES = Number(process.env.MT5_RECORD_BYTES ?? process.env.MT5_SINGLE_RECORD_BYTES_DEFAULT ?? RECORD_BYTES_CALC);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function isRetryableFsError(err) {
    const code = err?.code;
    return code === 'EACCES' || code === 'EPERM' || code === 'EBUSY' || code === 'ENOENT';
}
async function main() {
    const logger = (0, shared_1.createLogger)('stock-price-producer');
    const kafka = new kafkajs_1.Kafka({ clientId: 'stock-price-producer', brokers: KAFKA_BROKERS });
    const producer = kafka.producer();
    await producer.connect();
    let stopping = false;
    const shutdown = async () => {
        if (stopping)
            return;
        stopping = true;
        try {
            await producer.disconnect();
        }
        catch {
            // ignore
        }
        logger.info('stock-price-producer stopped');
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    logger.info({
        bookFile: BOOK_FILE_PATH,
        pollMs: POLL_MS,
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
    }, 'MT5 book-file stock price producer started');
    let offset = HEADER_BYTES;
    let initializedOffset = false;
    let consecutiveErrors = 0;
    let published = 0;
    let lastLogMs = 0;
    let lastMtimeMs = 0;
    let lastForcedSnapshotMs = 0;
    let lastInvalidWarnMs = 0;
    const lastSentBySymbol = new Map();
    while (!stopping) {
        try {
            const st = await promises_1.default.stat(BOOK_FILE_PATH);
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
            if (offset > size)
                offset = HEADER_BYTES;
            const available = size - offset;
            const readable = available - (available % RECORD_BYTES);
            if (readable <= 0) {
                consecutiveErrors = 0;
                const nowMs = Date.now();
                if (nowMs - lastLogMs > 5000) {
                    lastLogMs = nowMs;
                    logger.info({ size, offset, recordBytes: RECORD_BYTES, published }, 'MT5 book file idle (no full record to read)');
                }
                await sleep(POLL_MS);
                continue;
            }
            const fh = await promises_1.default.open(BOOK_FILE_PATH, 'r');
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
                const messages = [];
                for (let i = 0; i + RECORD_BYTES <= bytesRead; i += RECORD_BYTES) {
                    const rec = parseRecord(buf, i);
                    if (!rec)
                        continue;
                    if (!isPlausibleQuote(rec)) {
                        const nowWarn = Date.now();
                        if (invalidLogged < 3 && nowWarn - lastInvalidWarnMs > 2000) {
                            lastInvalidWarnMs = nowWarn;
                            invalidLogged += 1;
                            logger.warn({
                                symbol: rec.symbol,
                                bid: rec.bid,
                                ask: rec.ask,
                                volume: rec.volume,
                                datetime: rec.datetime,
                                recordBytes: RECORD_BYTES,
                                offsetInChunk: i,
                            }, 'Discarding implausible MT5 record (check struct/layout/header/record size)');
                        }
                        continue;
                    }
                    const mid = (rec.bid + rec.ask) / 2;
                    if (!Number.isFinite(mid) || mid <= 0)
                        continue;
                    // Prefer timestamp from MT5 record if it looks valid.
                    // Many EAs write datetime in milliseconds since epoch. If it's in seconds, convert.
                    let recTs = rec.datetime;
                    if (Number.isFinite(recTs) && recTs > 0 && recTs < 10_000_000_000)
                        recTs = recTs * 1000;
                    if (!Number.isFinite(recTs) || recTs <= 0)
                        recTs = nowMs;
                    const prev = lastSentBySymbol.get(rec.symbol);
                    if (prev &&
                        prev.bid === rec.bid &&
                        prev.ask === rec.ask &&
                        prev.volume === rec.volume &&
                        prev.datetime === rec.datetime) {
                        continue;
                    }
                    lastSentBySymbol.set(rec.symbol, {
                        bid: rec.bid,
                        ask: rec.ask,
                        volume: rec.volume,
                        datetime: rec.datetime,
                    });
                    const payload = JSON.stringify({
                        type: 'tick',
                        symbol: rec.symbol,
                        priceBRL: mid,
                        bid: rec.bid,
                        ask: rec.ask,
                        volume: rec.volume,
                        timestamp: now.toISOString(),
                        ts: recTs,
                    });
                    messages.push({ key: rec.symbol, value: payload });
                    published += 1;
                    batchPublished += 1;
                }
                if (messages.length > 0) {
                    await producer.send({
                        topic: TOPIC,
                        messages,
                    });
                }
                offset += bytesRead;
                consecutiveErrors = 0;
                const now2 = Date.now();
                if (batchPublished > 0 && now2 - lastLogMs > 2000) {
                    lastLogMs = now2;
                    logger.info({ bytesRead, batchPublished, published, offset }, 'Published MT5 ticks batch');
                }
            }
            finally {
                await fh.close();
            }
        }
        catch (err) {
            consecutiveErrors += 1;
            const retryable = isRetryableFsError(err);
            const backoff = Math.min(2000, 50 * 2 ** Math.min(8, consecutiveErrors));
            if (retryable) {
                logger.warn({ err, backoff, consecutiveErrors }, 'Failed to read MT5 book file (retrying)');
            }
            else {
                logger.error({ err }, 'Fatal error reading MT5 book file');
            }
            await sleep(retryable ? backoff : 1000);
        }
    }
    // no-op (kept for symmetry with other services)
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map
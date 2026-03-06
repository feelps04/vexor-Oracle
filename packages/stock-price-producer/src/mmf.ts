// @ts-nocheck

import { Buffer } from 'node:buffer';
import ffi from 'ffi-napi';
import ref from 'ref-napi';

const voidPtr = ref.refType(ref.types.void);

// Win32 constants
const PAGE_READONLY = 0x02;
const FILE_MAP_READ = 0x0004;

// Environment / layout configuration (must match Sentinel_RAM v5)
export type MmfConfig = {
  name: string;
  recordBytes: number;
  recordCount: number;
  bidOffset: number;
  askOffset: number;
  volumeOffset: number;
  timeOffset: number;
  hbOffset: number;
  wfOffset: number;
  symbolOffset: number;
  symbolBytes: number;
};

function getEnvConfig(): MmfConfig {
  const name = process.env.MMF_NAME ?? 'Local\\B3RAM';
  const recordBytes = Number(process.env.MMF_RECORD_BYTES ?? 128);
  const recordCount = Number(process.env.MMF_RECORD_COUNT ?? 8192);

  const bidOffset = Number(process.env.MMF_BID_OFFSET ?? 0);
  const askOffset = Number(process.env.MMF_ASK_OFFSET ?? 8);
  const volumeOffset = Number(process.env.MMF_VOLUME_OFFSET ?? 16);
  const timeOffset = Number(process.env.MMF_TIME_OFFSET ?? 24);
  const hbOffset = Number(process.env.MMF_HB_OFFSET ?? 36);
  const wfOffset = Number(process.env.MMF_WF_OFFSET ?? 40);
  const symbolOffset = Number(process.env.MMF_SYMBOL_OFFSET ?? 44);
  const symbolBytes = Number(process.env.MMF_SYMBOL_BYTES ?? 16);

  return {
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
  };
}

function assertConfig(cfg: MmfConfig): void {
  if (!cfg.name) throw new Error('MMF name is required');
  if (!Number.isFinite(cfg.recordBytes) || cfg.recordBytes <= 0) {
    throw new Error(`Invalid MMF recordBytes=${cfg.recordBytes} for "${cfg.name}"`);
  }
  if (!Number.isFinite(cfg.recordCount) || cfg.recordCount <= 0) {
    throw new Error(`Invalid MMF recordCount=${cfg.recordCount} for "${cfg.name}"`);
  }
  if (!Number.isFinite(cfg.symbolBytes) || cfg.symbolBytes <= 0) {
    throw new Error(`Invalid MMF symbolBytes=${cfg.symbolBytes} for "${cfg.name}"`);
  }
}

// kernel32 bindings
const kernel32 = ffi.Library('kernel32', {
  OpenFileMappingW: [voidPtr, ['uint32', 'int32', 'pointer']],
  MapViewOfFile: [voidPtr, [voidPtr, 'uint32', 'uint32', 'uint32', 'size_t']],
  UnmapViewOfFile: ['int32', [voidPtr]],
  CloseHandle: ['int32', [voidPtr]],
});

function toWideString(str: string): Buffer {
  const buf = Buffer.from(str + '\0', 'utf16le');
  return buf;
}

export type MmfView = {
  handle: Buffer;
  view: Buffer;
};

function buildMmfNameCandidates(name: string): string[] {
  const raw = String(name ?? '').trim();
  if (!raw) return [];

  const out: string[] = [];
  const push = (v: string): void => {
    const s = String(v ?? '').trim();
    if (!s) return;
    if (!out.includes(s)) out.push(s);
  };

  push(raw);

  const localPrefix = 'Local\\';
  const globalPrefix = 'Global\\';

  const isLocal = raw.toLowerCase().startsWith(localPrefix.toLowerCase());
  const isGlobal = raw.toLowerCase().startsWith(globalPrefix.toLowerCase());

  if (isLocal) {
    const base = raw.slice(localPrefix.length);
    push(base);
    push(globalPrefix + base);
  } else if (isGlobal) {
    const base = raw.slice(globalPrefix.length);
    push(base);
    push(localPrefix + base);
  } else {
    push(localPrefix + raw);
    push(globalPrefix + raw);
  }

  return out;
}

export function openMmfWithConfig(cfg: MmfConfig): MmfView {
  assertConfig(cfg);
  const mmfSize = cfg.recordBytes * cfg.recordCount;

  const candidates = buildMmfNameCandidates(cfg.name);
  let lastErr: string | null = null;

  for (const cand of candidates) {
    const nameBuf = toWideString(cand);
    const hMap = kernel32.OpenFileMappingW(FILE_MAP_READ, 0, nameBuf);
    if (ref.isNull(hMap)) {
      lastErr = `OpenFileMappingW failed for "${cand}"`;
      continue;
    }

    const pView = kernel32.MapViewOfFile(hMap, FILE_MAP_READ, 0, 0, mmfSize);
    if (ref.isNull(pView)) {
      kernel32.CloseHandle(hMap);
      lastErr = `MapViewOfFile failed for "${cand}"`;
      continue;
    }

    const buf = ref.reinterpret(pView, mmfSize, 0) as Buffer;
    return {
      handle: hMap,
      view: buf,
    };
  }

  throw new Error(lastErr || `OpenFileMappingW failed for "${cfg.name}"`);
}

export function openMmf(): MmfView {
  return openMmfWithConfig(getEnvConfig());
}

export function closeMmf(mmf: MmfView | null | undefined): void {
  if (!mmf) return;
  try {
    if (mmf.view && !ref.isNull(mmf.view as any)) {
      kernel32.UnmapViewOfFile(mmf.view);
    }
  } catch {
    // ignore
  }
  try {
    if (mmf.handle && !ref.isNull(mmf.handle as any)) {
      kernel32.CloseHandle(mmf.handle);
    }
  } catch {
    // ignore
  }
}

export type MmfRecord = {
  symbol: string;
  bid: number;
  ask: number;
  volume: number;
  ts: number;
  hb: number;
};

function decodeSymbol(buf: Buffer, offset: number, symbolBytes: number): string {
  const slice = buf.subarray(offset, offset + symbolBytes);
  const nul = slice.indexOf(0);
  const body = nul >= 0 ? slice.subarray(0, nul) : slice;
  return body.toString('ascii').trim().toUpperCase();
}

export function readAllRecordsWithConfig(view: Buffer, cfg: MmfConfig): MmfRecord[] {
  assertConfig(cfg);
  const out: MmfRecord[] = [];

  for (let i = 0; i < cfg.recordCount; i += 1) {
    const base = i * cfg.recordBytes;
    const wf = view.readInt32LE(base + cfg.wfOffset);
    if (wf !== 0) continue;

    const symbol = decodeSymbol(view, base + cfg.symbolOffset, cfg.symbolBytes);
    if (!symbol) continue;

    const bid = view.readDoubleLE(base + cfg.bidOffset);
    const ask = view.readDoubleLE(base + cfg.askOffset);
    const volume = Number(view.readBigInt64LE(base + cfg.volumeOffset));
    const ts = Number(view.readBigInt64LE(base + cfg.timeOffset));
    const hb = view.readInt32LE(base + cfg.hbOffset);

    if (!Number.isFinite(bid) || !Number.isFinite(ask)) continue;
    if (bid <= 0 || ask <= 0) continue;
    if (ask < bid) continue;

    out.push({ symbol, bid, ask, volume, ts, hb });
  }

  return out;
}

export function readAllRecords(view: Buffer): MmfRecord[] {
  return readAllRecordsWithConfig(view, getEnvConfig());
}


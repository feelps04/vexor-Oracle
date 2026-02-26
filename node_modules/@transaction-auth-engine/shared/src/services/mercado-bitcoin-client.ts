import axios from 'axios';
import https from 'node:https';

const MERCADO_BITCOIN_TICKERS_URL = 'https://api.mercadobitcoin.net/api/v4/tickers?symbols=BTC-BRL';
const MERCADO_BITCOIN_CANDLES_URL = 'https://api.mercadobitcoin.net/api/v4/candles';

/** Response item shape from Mercado Bitcoin v4 public tickers endpoint. */
interface TickerResponseItem {
  pair?: string;
  last?: string;
  buy?: string;
  sell?: string;
  high?: string;
  low?: string;
  [key: string]: unknown;
}

export interface BtcTickerResult {
  /** BTC price in BRL (float). */
  priceBRL: number;
  /** Raw last price string. */
  last: string;
}

export interface BtcCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export class MercadoBitcoinClient {
  private readonly httpsAgent = new https.Agent({ family: 4 });

  async getBtcBrlTicker(): Promise<BtcTickerResult> {
    try {
      const response = await this.withRetry(() =>
        axios.get<TickerResponseItem[]>(MERCADO_BITCOIN_TICKERS_URL, {
          timeout: 20_000,
          httpsAgent: this.httpsAgent,
        })
      );
      const items = response.data;
      const first = Array.isArray(items) ? items[0] : undefined;
      const lastStr = first?.last ?? first?.buy ?? first?.sell;
      if (lastStr == null || lastStr === '') {
        throw new Error('Mercado Bitcoin ticker: missing price field');
      }
      const priceBRL = parseFloat(String(lastStr));
      if (!Number.isFinite(priceBRL) || priceBRL <= 0) {
        throw new Error(`Mercado Bitcoin ticker: invalid price ${lastStr}`);
      }
      return { priceBRL, last: String(lastStr) };
    } catch (error) {
      throw new Error(
        `Mercado Bitcoin ticker failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getBtcBrlCandles(params: {
    fromSec: number;
    toSec: number;
    resolution: string;
  }): Promise<BtcCandle[]> {
    try {
      const response = await this.withRetry(() =>
        axios.get(MERCADO_BITCOIN_CANDLES_URL, {
          timeout: 20_000,
          httpsAgent: this.httpsAgent,
          params: {
            symbol: 'BTC-BRL',
            resolution: params.resolution,
            from: params.fromSec,
            to: params.toSec,
          },
        })
      );

      const body = response.data as {
        t?: number[];
        o?: string[];
        h?: string[];
        l?: string[];
        c?: string[];
        v?: string[];
        s?: string;
      };

      const t = Array.isArray(body?.t) ? body.t : [];
      const o = Array.isArray(body?.o) ? body.o : [];
      const h = Array.isArray(body?.h) ? body.h : [];
      const l = Array.isArray(body?.l) ? body.l : [];
      const c = Array.isArray(body?.c) ? body.c : [];
      const v = Array.isArray(body?.v) ? body.v : [];
      const n = Math.min(t.length, o.length, h.length, l.length, c.length);

      const out: BtcCandle[] = [];
      for (let i = 0; i < n; i++) {
        const time = Number(t[i]);
        const open = parseFloat(String(o[i]));
        const high = parseFloat(String(h[i]));
        const low = parseFloat(String(l[i]));
        const close = parseFloat(String(c[i]));
        const volume = v[i] != null ? parseFloat(String(v[i])) : undefined;
        if (
          !Number.isFinite(time) ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close)
        ) {
          continue;
        }
        out.push({ time, open, high, low, close, volume });
      }
      out.sort((a, b) => a.time - b.time);
      return out;
    } catch (error) {
      throw new Error(
        `Mercado Bitcoin candles failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const transient =
          msg.includes('timeout') ||
          msg.includes('ECONNABORTED') ||
          msg.includes('EAI_AGAIN') ||
          msg.includes('ENOTFOUND') ||
          msg.includes('ECONNRESET');
        if (!transient || attempt === 2) break;
        const backoffMs = 250 * (attempt + 1);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

import axios from 'axios';

const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

export type TwelveDataFxInterval = '1m' | '5m' | '15m' | '1h' | '1d';

export interface TwelveDataCandle {
  time: number; // epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

type TwelveDataTimeSeriesValue = {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
};

type TwelveDataTimeSeriesResponse = {
  status?: 'ok' | 'error';
  message?: string;
  code?: number;
  values?: TwelveDataTimeSeriesValue[];
};

type TwelveDataPriceResponse = {
  status?: 'ok' | 'error';
  message?: string;
  code?: number;
  price?: string;
};

function intervalToTwelve(interval: TwelveDataFxInterval): string {
  if (interval === '1m') return '1min';
  if (interval === '5m') return '5min';
  if (interval === '15m') return '15min';
  if (interval === '1h') return '1h';
  return '1day';
}

function parseDatetimeToEpochSeconds(s: string): number {
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return NaN;
  return Math.floor(ms / 1000);
}

export class TwelveDataClient {
  private readonly apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async getFxRate(pair: string): Promise<number> {
    if (!this.apiKey) {
      throw new Error('Twelve Data API key not configured');
    }

    try {
      const response = await axios.get<TwelveDataPriceResponse>(`${TWELVE_DATA_BASE_URL}/price`, {
        timeout: 10_000,
        params: {
          symbol: pair,
          apikey: this.apiKey,
        },
      });

      const body = response.data;
      if (body?.status === 'error') {
        throw new Error(body.message ?? 'unknown error');
      }
      const price = parseFloat(String(body?.price));
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error('invalid price');
      }
      return price;
    } catch (error) {
      throw new Error(`Twelve Data price failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getFxCandles(params: {
    pair: string;
    interval: TwelveDataFxInterval;
    outputsize: number;
  }): Promise<TwelveDataCandle[]> {
    if (!this.apiKey) {
      throw new Error('Twelve Data API key not configured');
    }

    try {
      const response = await axios.get<TwelveDataTimeSeriesResponse>(`${TWELVE_DATA_BASE_URL}/time_series`, {
        timeout: 10_000,
        params: {
          symbol: params.pair,
          interval: intervalToTwelve(params.interval),
          outputsize: Math.max(10, Math.min(5000, params.outputsize)),
          format: 'JSON',
          apikey: this.apiKey,
        },
      });

      const body = response.data;
      if (body?.status === 'error') {
        throw new Error(body.message ?? 'unknown error');
      }

      const values = Array.isArray(body?.values) ? body.values : [];
      const out: TwelveDataCandle[] = [];
      for (const v of values) {
        const dt = String(v.datetime ?? '');
        const time = parseDatetimeToEpochSeconds(dt);
        const open = parseFloat(String(v.open));
        const high = parseFloat(String(v.high));
        const low = parseFloat(String(v.low));
        const close = parseFloat(String(v.close));
        if (
          !Number.isFinite(time) ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close)
        ) {
          continue;
        }
        out.push({ time, open, high, low, close });
      }

      // Twelve Data returns newest first; UI expects ascending time.
      out.sort((a, b) => a.time - b.time);
      return out;
    } catch (error) {
      throw new Error(`Twelve Data time_series failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

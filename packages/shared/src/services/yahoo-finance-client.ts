import axios from 'axios';

const YAHOO_FINANCE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

export type YahooFxInterval = '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '1h' | '1d';

export interface YahooFxCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: string | null;
  };
}

function intervalToYahoo(interval: YahooFxInterval): string {
  const map: Record<string, string> = {
    '1m': '1m',
    '2m': '2m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '60m': '1h',
    '1h': '1h',
    '1d': '1d',
  };
  return map[interval] || '1d';
}

function rangeToPeriod(range: string): { period1: number; period2: number } {
  const now = Math.floor(Date.now() / 1000);
  const minutes = (m: number) => now - m * 60;
  const hours = (h: number) => now - h * 3600;
  const days = (d: number) => now - d * 86400;

  const rangeMap: Record<string, number> = {
    '1h': minutes(60),
    '6h': hours(6),
    '1d': hours(24),
    '5d': days(5),
    '7d': days(7),
    '1mo': days(30),
    '3mo': days(90),
    '6mo': days(180),
    '1y': days(365),
    '2y': days(730),
    '5y': days(1825),
  };

  const period1 = rangeMap[range] || days(7);
  return { period1, period2: now };
}

export class YahooFinanceClient {
  async getFxCandles(params: {
    pair: string; // e.g., "USDBRL=X"
    interval: YahooFxInterval;
    range: string;
  }): Promise<YahooFxCandle[]> {
    try {
      const symbol = params.pair.includes('=') ? params.pair : `${params.pair}=X`;
      const { period1, period2 } = rangeToPeriod(params.range);
      const interval = intervalToYahoo(params.interval);

      const url = `${YAHOO_FINANCE_URL}/${symbol}`;
      const response = await axios.get<YahooChartResponse>(url, {
        timeout: 15_000,
        params: {
          period1,
          period2,
          interval,
          includeAdjustedClose: false,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const result = response.data?.chart?.result?.[0];
      if (!result) {
        throw new Error('No data from Yahoo Finance');
      }

      const timestamps = result.timestamp || [];
      const quote = result.indicators?.quote?.[0];
      if (!quote) {
        throw new Error('No quote data');
      }

      const opens = quote.open || [];
      const highs = quote.high || [];
      const lows = quote.low || [];
      const closes = quote.close || [];

      const out: YahooFxCandle[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const time = timestamps[i];
        const open = opens[i];
        const high = highs[i];
        const low = lows[i];
        const close = closes[i];

        if (
          time != null &&
          open != null &&
          high != null &&
          low != null &&
          close != null &&
          !isNaN(open) &&
          !isNaN(high) &&
          !isNaN(low) &&
          !isNaN(close)
        ) {
          out.push({ time, open, high, low, close });
        }
      }

      return out;
    } catch (error) {
      throw new Error(
        `Yahoo Finance FX failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getFxRate(pair: string): Promise<number> {
    try {
      const candles = await this.getFxCandles({
        pair,
        interval: '1m',
        range: '1h',
      });
      if (candles.length === 0) {
        throw new Error('No recent price data');
      }
      return candles[candles.length - 1].close;
    } catch (error) {
      throw new Error(
        `Yahoo Finance rate failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

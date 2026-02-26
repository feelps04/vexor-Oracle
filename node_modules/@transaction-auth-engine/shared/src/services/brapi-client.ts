import axios from 'axios';

const BRAPI_BASE = 'https://brapi.dev/api';

/** Brapi quote response (results array). */
interface BrapiQuoteResult {
  symbol?: string;
  regularMarketPrice?: number;
  [key: string]: unknown;
}

interface BrapiQuoteResponse {
  results?: BrapiQuoteResult[];
}

export interface StockQuoteResult {
  /** Current price in BRL. */
  priceBRL: number;
  symbol: string;
}

export interface BrapiClientConfig {
  /** Optional. For test symbols (PETR4, VALE3, MGLU3, ITUB4) no token needed. */
  token?: string;
}

export class BrapiClient {
  constructor(private readonly config: BrapiClientConfig = {}) {}

  /**
   * Fetch current quote for a stock symbol (e.g. PETR4, VALE3).
   * Token optional for the 4 free test symbols.
   */
  async getQuote(symbol: string): Promise<StockQuoteResult> {
    const headers: Record<string, string> = {};
    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }
    const tokenParam = this.config.token ? { token: this.config.token } : {};

    const fetchQuote = async (sym: string): Promise<StockQuoteResult> => {
      const url = `${BRAPI_BASE}/quote/${encodeURIComponent(sym)}`;
      const response = await axios.get<BrapiQuoteResponse>(url, {
        timeout: 10_000,
        headers: Object.keys(headers).length ? headers : undefined,
        params: tokenParam,
      });
      const data = response.data;
      const results = data?.results;
      if (!Array.isArray(results) || results.length === 0) {
        throw new Error(`Brapi: no quote for symbol ${sym}`);
      }
      const first = results[0];
      const price = first?.regularMarketPrice ?? (first as { price?: number }).price;
      if (price == null || !Number.isFinite(price) || price <= 0) {
        throw new Error(`Brapi: invalid price for ${sym}`);
      }
      return {
        priceBRL: Number(price),
        symbol: first?.symbol ?? sym,
      };
    };

    try {
      return await fetchQuote(symbol);
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 404 &&
        symbol &&
        !symbol.includes('.') &&
        (symbol.toUpperCase().endsWith('3') ||
          symbol.toUpperCase().endsWith('4') ||
          symbol.toUpperCase().endsWith('11') ||
          /\d$/.test(symbol))
      ) {
        try {
          return await fetchQuote(`${symbol}.SA`);
        } catch {
          // fallthrough
        }
      }
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        throw new Error('Brapi: token inválido ou ausente. Obtenha em brapi.dev/dashboard');
      }
      throw new Error(
        `Brapi quote failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.YahooFinanceClient = void 0;
const axios_1 = __importDefault(require("axios"));
const YAHOO_FINANCE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
function intervalToYahoo(interval) {
    const map = {
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
function rangeToPeriod(range) {
    const now = Math.floor(Date.now() / 1000);
    const minutes = (m) => now - m * 60;
    const hours = (h) => now - h * 3600;
    const days = (d) => now - d * 86400;
    const rangeMap = {
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
class YahooFinanceClient {
    async getFxCandles(params) {
        try {
            const symbol = params.pair.includes('=') ? params.pair : `${params.pair}=X`;
            const { period1, period2 } = rangeToPeriod(params.range);
            const interval = intervalToYahoo(params.interval);
            const url = `${YAHOO_FINANCE_URL}/${symbol}`;
            const response = await axios_1.default.get(url, {
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
            const out = [];
            for (let i = 0; i < timestamps.length; i++) {
                const time = timestamps[i];
                const open = opens[i];
                const high = highs[i];
                const low = lows[i];
                const close = closes[i];
                if (time != null &&
                    open != null &&
                    high != null &&
                    low != null &&
                    close != null &&
                    !isNaN(open) &&
                    !isNaN(high) &&
                    !isNaN(low) &&
                    !isNaN(close)) {
                    out.push({ time, open, high, low, close });
                }
            }
            return out;
        }
        catch (error) {
            throw new Error(`Yahoo Finance FX failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getFxRate(pair) {
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
        }
        catch (error) {
            throw new Error(`Yahoo Finance rate failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.YahooFinanceClient = YahooFinanceClient;
//# sourceMappingURL=yahoo-finance-client.js.map
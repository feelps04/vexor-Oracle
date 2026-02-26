"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwelveDataClient = void 0;
const axios_1 = __importDefault(require("axios"));
const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';
function intervalToTwelve(interval) {
    if (interval === '1m')
        return '1min';
    if (interval === '5m')
        return '5min';
    if (interval === '15m')
        return '15min';
    if (interval === '1h')
        return '1h';
    return '1day';
}
function parseDatetimeToEpochSeconds(s) {
    const ms = Date.parse(s);
    if (!Number.isFinite(ms))
        return NaN;
    return Math.floor(ms / 1000);
}
class TwelveDataClient {
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    isEnabled() {
        return Boolean(this.apiKey);
    }
    async getFxRate(pair) {
        if (!this.apiKey) {
            throw new Error('Twelve Data API key not configured');
        }
        try {
            const response = await axios_1.default.get(`${TWELVE_DATA_BASE_URL}/price`, {
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
        }
        catch (error) {
            throw new Error(`Twelve Data price failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getFxCandles(params) {
        if (!this.apiKey) {
            throw new Error('Twelve Data API key not configured');
        }
        try {
            const response = await axios_1.default.get(`${TWELVE_DATA_BASE_URL}/time_series`, {
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
            const out = [];
            for (const v of values) {
                const dt = String(v.datetime ?? '');
                const time = parseDatetimeToEpochSeconds(dt);
                const open = parseFloat(String(v.open));
                const high = parseFloat(String(v.high));
                const low = parseFloat(String(v.low));
                const close = parseFloat(String(v.close));
                if (!Number.isFinite(time) ||
                    !Number.isFinite(open) ||
                    !Number.isFinite(high) ||
                    !Number.isFinite(low) ||
                    !Number.isFinite(close)) {
                    continue;
                }
                out.push({ time, open, high, low, close });
            }
            // Twelve Data returns newest first; UI expects ascending time.
            out.sort((a, b) => a.time - b.time);
            return out;
        }
        catch (error) {
            throw new Error(`Twelve Data time_series failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.TwelveDataClient = TwelveDataClient;
//# sourceMappingURL=twelve-data-client.js.map
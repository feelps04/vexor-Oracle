"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrapiClient = void 0;
const axios_1 = __importDefault(require("axios"));
const BRAPI_BASE = 'https://brapi.dev/api';
class BrapiClient {
    config;
    constructor(config = {}) {
        this.config = config;
    }
    /**
     * Fetch current quote for a stock symbol (e.g. PETR4, VALE3).
     * Token optional for the 4 free test symbols.
     */
    async getQuote(symbol) {
        const url = `${BRAPI_BASE}/quote/${encodeURIComponent(symbol)}`;
        const headers = {};
        if (this.config.token) {
            headers['Authorization'] = `Bearer ${this.config.token}`;
        }
        const params = this.config.token ? {} : undefined;
        const tokenParam = this.config.token ? { token: this.config.token } : {};
        try {
            const response = await axios_1.default.get(url, {
                timeout: 10_000,
                headers: Object.keys(headers).length ? headers : undefined,
                params: tokenParam,
            });
            const data = response.data;
            const results = data?.results;
            if (!Array.isArray(results) || results.length === 0) {
                throw new Error(`Brapi: no quote for symbol ${symbol}`);
            }
            const first = results[0];
            const price = first?.regularMarketPrice ?? first.price;
            if (price == null || !Number.isFinite(price) || price <= 0) {
                throw new Error(`Brapi: invalid price for ${symbol}`);
            }
            return {
                priceBRL: Number(price),
                symbol: first?.symbol ?? symbol,
            };
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) && error.response?.status === 401) {
                throw new Error('Brapi: token inválido ou ausente. Obtenha em brapi.dev/dashboard');
            }
            throw new Error(`Brapi quote failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.BrapiClient = BrapiClient;
//# sourceMappingURL=brapi-client.js.map
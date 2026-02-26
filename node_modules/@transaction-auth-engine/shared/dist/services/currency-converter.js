"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyConverter = void 0;
const axios_1 = __importDefault(require("axios"));
const AWESOMEAPI_URL = 'https://economia.awesomeapi.com.br/last/';
class CurrencyConverter {
    async convertToBRL(amount, currency) {
        if (currency === 'BRL')
            return amount;
        try {
            const response = await axios_1.default.get(`${AWESOMEAPI_URL}${currency}-BRL`, {
                timeout: 10_000,
            });
            const key = `${currency}BRL`;
            const data = response.data;
            if (!data || !data[key]) {
                throw new Error(`Unexpected response: ${currency}-BRL`);
            }
            const rate = parseFloat(data[key].bid);
            return Math.round(amount * rate);
        }
        catch (error) {
            throw new Error(`Falha na conversão de moeda: ${currency} - ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /** Returns { amountBRL, rate }. */
    async convertToBRLWithRate(amount, currency) {
        if (currency === 'BRL') {
            return { amountBRL: amount, rate: 1 };
        }
        try {
            const response = await axios_1.default.get(`${AWESOMEAPI_URL}${currency}-BRL`, {
                timeout: 10_000,
            });
            const key = `${currency}BRL`;
            const data = response.data;
            if (!data || !data[key]) {
                throw new Error(`Unexpected response: ${currency}-BRL`);
            }
            const rate = parseFloat(data[key].bid);
            const amountBRL = Math.round(amount * rate);
            return { amountBRL, rate };
        }
        catch (error) {
            throw new Error(`Falha na conversão de moeda: ${currency} - ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.CurrencyConverter = CurrencyConverter;
//# sourceMappingURL=currency-converter.js.map
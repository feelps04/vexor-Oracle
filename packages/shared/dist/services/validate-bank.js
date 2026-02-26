"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBankCode = validateBankCode;
const axios_1 = __importDefault(require("axios"));
const BRASILAPI_BANKS = 'https://brasilapi.com.br/api/banks/v1/';
async function validateBankCode(bankCode) {
    const code = bankCode.replace(/\D/g, '').padStart(3, '0').slice(0, 3);
    const response = await axios_1.default.get(`${BRASILAPI_BANKS}${code}`, {
        timeout: 10_000,
        validateStatus: (status) => status === 200,
    });
    if (response.status !== 200 || !response.data?.name) {
        throw new Error(`Banco inválido ou não encontrado: ${bankCode}`);
    }
    return response.data;
}
//# sourceMappingURL=validate-bank.js.map
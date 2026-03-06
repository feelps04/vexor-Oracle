"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBankHolidayToday = isBankHolidayToday;
const axios_1 = __importDefault(require("axios"));
const BRASILAPI_HOLIDAYS = 'https://brasilapi.com.br/api/feriados/v1/';
/** Check if today (Brazil timezone) is a national bank holiday. */
async function isBankHolidayToday() {
    const now = new Date();
    const year = now.getFullYear();
    try {
        const response = await axios_1.default.get(`${BRASILAPI_HOLIDAYS}${year}`, {
            timeout: 10_000,
        });
        if (!Array.isArray(response.data))
            return false;
        const today = now.toISOString().slice(0, 10);
        return response.data.some((h) => h.date === today);
    }
    catch {
        return false;
    }
}

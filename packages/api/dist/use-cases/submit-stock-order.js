"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitStockOrder = submitStockOrder;
const crypto_1 = require("crypto");
const core_1 = require("@transaction-auth-engine/core");
/** Fetches stock price from Brapi, builds order payload, sends to Kafka. */
async function submitStockOrder(producer, brapi, input) {
    const quote = input.priceBRL == null ? await brapi.getQuote(input.symbol) : undefined;
    const priceBRL = input.priceBRL ?? quote.priceBRL;
    const symbol = input.quoteSymbol ?? quote?.symbol ?? input.symbol;
    const amountBRL = Math.round(input.quantity * priceBRL * 100); // cents
    const transaction = new core_1.Transaction((0, crypto_1.randomUUID)(), input.idempotencyKey, input.accountId, amountBRL, 'BRL', input.merchantId ?? 'stock-exchange', 'PENDING', undefined, undefined, amountBRL, priceBRL, undefined, 'stock_buy', undefined, undefined, symbol, input.quantity, priceBRL);
    await producer.sendTransaction(transaction);
    return transaction;
}

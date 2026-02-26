"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitBtcOrder = submitBtcOrder;
const crypto_1 = require("crypto");
const core_1 = require("@transaction-auth-engine/core");
/** Fetches BTC price from Mercado Bitcoin, builds order payload, sends to Kafka. */
async function submitBtcOrder(producer, mercadoBitcoin, input) {
    const priceBRL = input.priceBRL ?? (await mercadoBitcoin.getBtcBrlTicker()).priceBRL;
    const amountBRL = Math.round(input.amountBtc * priceBRL * 100); // cents
    const transaction = new core_1.Transaction((0, crypto_1.randomUUID)(), input.idempotencyKey, input.accountId, amountBRL, 'BRL', input.merchantId ?? 'crypto-exchange', 'PENDING', undefined, undefined, amountBRL, priceBRL, undefined, 'crypto_buy', input.amountBtc, priceBRL);
    await producer.sendTransaction(transaction);
    return transaction;
}
//# sourceMappingURL=submit-btc-order.js.map
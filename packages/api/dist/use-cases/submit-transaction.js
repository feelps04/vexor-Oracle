"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitTransaction = submitTransaction;
const crypto_1 = require("crypto");
const core_1 = require("@transaction-auth-engine/core");
async function submitTransaction(producer, input) {
    const transaction = new core_1.Transaction((0, crypto_1.randomUUID)(), input.idempotencyKey, input.accountId, input.amount, input.currency, input.merchantId, 'PENDING', undefined, input.targetBankCode, input.amountBRL, input.rate, input.bankName, 'settlement', undefined, undefined, undefined, undefined, undefined, input.biometricToken);
    await producer.sendTransaction(transaction);
    return transaction;
}
//# sourceMappingURL=submit-transaction.js.map
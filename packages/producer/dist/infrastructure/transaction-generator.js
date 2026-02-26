"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTransaction = generateTransaction;
exports.generateTransactionBatch = generateTransactionBatch;
const crypto_1 = require("crypto");
const core_1 = require("@transaction-auth-engine/core");
const DEFAULT_CURRENCY = 'BRL';
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 500;
const DEFAULT_ACCOUNT_COUNT = 1000;
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function generateTransaction(options = {}) {
    const { currency = DEFAULT_CURRENCY, minAmount = MIN_AMOUNT, maxAmount = MAX_AMOUNT, accountCount = DEFAULT_ACCOUNT_COUNT, } = options;
    const accountId = `acc-${randomInt(1, accountCount)}`;
    const amount = randomInt(minAmount, maxAmount) * 100; // cents
    const idempotencyKey = (0, crypto_1.randomUUID)();
    const id = (0, crypto_1.randomUUID)();
    const merchantId = `merchant-${randomInt(1, 100)}`;
    return new core_1.Transaction(id, idempotencyKey, accountId, amount, currency, merchantId, 'PENDING');
}
function generateTransactionBatch(count, options) {
    const batch = [];
    for (let i = 0; i < count; i++) {
        batch.push(generateTransaction(options));
    }
    return batch;
}
//# sourceMappingURL=transaction-generator.js.map
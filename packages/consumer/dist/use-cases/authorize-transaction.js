"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeTransaction = authorizeTransaction;
const core_1 = require("@transaction-auth-engine/core");
async function authorizeTransaction(payload, balanceRepo, idempotencyRepo, logger, options) {
    const transaction = core_1.Transaction.fromJSON(payload);
    if (!options?.skipAcquire) {
        const acquired = await idempotencyRepo.tryAcquire(transaction.idempotencyKey);
        if (!acquired) {
            logger.debug({ idempotencyKey: transaction.idempotencyKey }, 'Duplicate transaction, skipping');
            throw new Error('IDEMPOTENT_SKIP');
        }
    }
    const debitAmount = transaction.getDebitAmount();
    const authorized = await balanceRepo.tryDebit(transaction.accountId, debitAmount);
    transaction.status = authorized ? 'AUTHORIZED' : 'DENIED';
    await idempotencyRepo.complete(transaction.idempotencyKey, {
        authorized,
        status: transaction.status,
    });
    return { authorized, transaction };
}
//# sourceMappingURL=authorize-transaction.js.map
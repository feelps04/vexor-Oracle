"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Transaction = exports.BTC_MINOR_UNITS = void 0;
/** 1 BTC = 10^8 minor units (satoshis). */
exports.BTC_MINOR_UNITS = 100_000_000;
class Transaction {
    id;
    idempotencyKey;
    accountId;
    amount;
    currency;
    merchantId;
    status;
    correlationId;
    targetBankCode;
    amountBRL;
    rate;
    bankName;
    orderType;
    amountBtc;
    btcRate;
    symbol;
    quantity;
    stockPrice;
    biometricToken;
    constructor(id, idempotencyKey, accountId, amount, currency, merchantId, status = 'PENDING', correlationId, targetBankCode, amountBRL, rate, bankName, orderType = 'settlement', amountBtc, btcRate, symbol, quantity, stockPrice, biometricToken) {
        this.id = id;
        this.idempotencyKey = idempotencyKey;
        this.accountId = accountId;
        this.amount = amount;
        this.currency = currency;
        this.merchantId = merchantId;
        this.status = status;
        this.correlationId = correlationId;
        this.targetBankCode = targetBankCode;
        this.amountBRL = amountBRL;
        this.rate = rate;
        this.bankName = bankName;
        this.orderType = orderType;
        this.amountBtc = amountBtc;
        this.btcRate = btcRate;
        this.symbol = symbol;
        this.quantity = quantity;
        this.stockPrice = stockPrice;
        this.biometricToken = biometricToken;
    }
    /** Amount to debit (BRL if converted, else original). */
    getDebitAmount() {
        return this.amountBRL ?? this.amount;
    }
    /** Correlation ID for observability (defaults to idempotencyKey). */
    getCorrelationId() {
        return this.correlationId ?? this.idempotencyKey;
    }
    /** Returns BTC amount in minor units (satoshis) for crypto_buy. */
    getAmountBtcMinor() {
        if (this.orderType !== 'crypto_buy' || this.amountBtc == null)
            return 0;
        return Math.round(this.amountBtc * exports.BTC_MINOR_UNITS);
    }
    toJSON() {
        return {
            id: this.id,
            idempotencyKey: this.idempotencyKey,
            correlationId: this.correlationId,
            accountId: this.accountId,
            amount: this.amount,
            currency: this.currency,
            merchantId: this.merchantId,
            status: this.status,
            targetBankCode: this.targetBankCode,
            amountBRL: this.amountBRL,
            rate: this.rate,
            bankName: this.bankName,
            orderType: this.orderType,
            amountBtc: this.amountBtc,
            btcRate: this.btcRate,
            symbol: this.symbol,
            quantity: this.quantity,
            stockPrice: this.stockPrice,
            biometricToken: this.biometricToken,
        };
    }
    static fromJSON(payload) {
        return new Transaction(payload.id, payload.idempotencyKey, payload.accountId, payload.amount, payload.currency, payload.merchantId, payload.status, payload.correlationId, payload.targetBankCode, payload.amountBRL, payload.rate, payload.bankName, payload.orderType ?? 'settlement', payload.amountBtc, payload.btcRate, payload.symbol, payload.quantity, payload.stockPrice, payload.biometricToken);
    }
}
exports.Transaction = Transaction;

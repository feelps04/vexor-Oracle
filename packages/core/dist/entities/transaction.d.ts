export type TransactionStatus = 'PENDING' | 'AUTHORIZED' | 'DENIED' | 'PENDING_SETTLEMENT';
export type OrderType = 'settlement' | 'crypto_buy' | 'stock_buy';
export interface TransactionPayload {
    id: string;
    idempotencyKey: string;
    correlationId?: string;
    accountId: string;
    amount: number;
    currency: string;
    merchantId: string;
    status: TransactionStatus;
    /** Bank code for TED/DOC/PIX (e.g. "033" for Santander). */
    targetBankCode?: string;
    /** Converted amount in BRL (minor units). Set when currency !== BRL or for asset buys. */
    amountBRL?: number;
    /** FX rate used for conversion (e.g. 4.98 for USD-BRL). */
    rate?: number;
    /** Bank name from BrasilAPI (e.g. "Banco Santander Brasil"). */
    bankName?: string;
    /** Order type: settlement (default), crypto_buy, stock_buy. */
    orderType?: OrderType;
    /** BTC amount (e.g. 0.001) for crypto_buy. */
    amountBtc?: number;
    /** BTC price in BRL at order time (for crypto_buy). */
    btcRate?: number;
    /** Stock symbol (e.g. PETR4) for stock_buy. */
    symbol?: string;
    /** Number of shares for stock_buy. */
    quantity?: number;
    /** Stock price in BRL at order time (for stock_buy). */
    stockPrice?: number;
    /** Optional biometric validation token (e.g. Face ID / Touch ID simulation). */
    biometricToken?: string;
}
/** 1 BTC = 10^8 minor units (satoshis). */
export declare const BTC_MINOR_UNITS = 100000000;
export declare class Transaction {
    readonly id: string;
    readonly idempotencyKey: string;
    readonly accountId: string;
    readonly amount: number;
    readonly currency: string;
    readonly merchantId: string;
    status: TransactionStatus;
    readonly correlationId?: string | undefined;
    readonly targetBankCode?: string | undefined;
    readonly amountBRL?: number | undefined;
    readonly rate?: number | undefined;
    readonly bankName?: string | undefined;
    readonly orderType: OrderType;
    readonly amountBtc?: number | undefined;
    readonly btcRate?: number | undefined;
    readonly symbol?: string | undefined;
    readonly quantity?: number | undefined;
    readonly stockPrice?: number | undefined;
    readonly biometricToken?: string | undefined;
    constructor(id: string, idempotencyKey: string, accountId: string, amount: number, currency: string, merchantId: string, status?: TransactionStatus, correlationId?: string | undefined, targetBankCode?: string | undefined, amountBRL?: number | undefined, rate?: number | undefined, bankName?: string | undefined, orderType?: OrderType, amountBtc?: number | undefined, btcRate?: number | undefined, symbol?: string | undefined, quantity?: number | undefined, stockPrice?: number | undefined, biometricToken?: string | undefined);
    /** Amount to debit (BRL if converted, else original). */
    getDebitAmount(): number;
    /** Correlation ID for observability (defaults to idempotencyKey). */
    getCorrelationId(): string;
    /** Returns BTC amount in minor units (satoshis) for crypto_buy. */
    getAmountBtcMinor(): number;
    toJSON(): TransactionPayload;
    static fromJSON(payload: TransactionPayload): Transaction;
}
//# sourceMappingURL=transaction.d.ts.map
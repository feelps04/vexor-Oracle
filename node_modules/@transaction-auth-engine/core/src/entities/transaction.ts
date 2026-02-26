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
export const BTC_MINOR_UNITS = 100_000_000;

export class Transaction {
  constructor(
    public readonly id: string,
    public readonly idempotencyKey: string,
    public readonly accountId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly merchantId: string,
    public status: TransactionStatus = 'PENDING',
    public readonly correlationId?: string,
    public readonly targetBankCode?: string,
    public readonly amountBRL?: number,
    public readonly rate?: number,
    public readonly bankName?: string,
    public readonly orderType: OrderType = 'settlement',
    public readonly amountBtc?: number,
    public readonly btcRate?: number,
    public readonly symbol?: string,
    public readonly quantity?: number,
    public readonly stockPrice?: number,
    public readonly biometricToken?: string
  ) {}

  /** Amount to debit (BRL if converted, else original). */
  getDebitAmount(): number {
    return this.amountBRL ?? this.amount;
  }

  /** Correlation ID for observability (defaults to idempotencyKey). */
  getCorrelationId(): string {
    return this.correlationId ?? this.idempotencyKey;
  }

  /** Returns BTC amount in minor units (satoshis) for crypto_buy. */
  getAmountBtcMinor(): number {
    if (this.orderType !== 'crypto_buy' || this.amountBtc == null) return 0;
    return Math.round(this.amountBtc * BTC_MINOR_UNITS);
  }

  toJSON(): TransactionPayload {
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

  static fromJSON(payload: TransactionPayload): Transaction {
    return new Transaction(
      payload.id,
      payload.idempotencyKey,
      payload.accountId,
      payload.amount,
      payload.currency,
      payload.merchantId,
      payload.status,
      payload.correlationId,
      payload.targetBankCode,
      payload.amountBRL,
      payload.rate,
      payload.bankName,
      payload.orderType ?? 'settlement',
      payload.amountBtc,
      payload.btcRate,
      payload.symbol,
      payload.quantity,
      payload.stockPrice,
      payload.biometricToken
    );
  }
}

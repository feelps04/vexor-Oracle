import type Redis from 'ioredis';
import type { BalanceRepository } from '@transaction-auth-engine/shared';
export declare class RedisBalanceRepository implements BalanceRepository {
    private readonly redis;
    private readonly initialBalance;
    constructor(redis: Redis, initialBalance?: number);
    getBalance(accountId: string): Promise<number>;
    debit(accountId: string, amount: number): Promise<void>;
    /** Atomic check + debit via Lua script to prevent race conditions. */
    tryDebit(accountId: string, amount: number): Promise<boolean>;
    /** Credit BTC to account (amount in minor units / satoshis). */
    creditBtc(accountId: string, amountMinor: number): Promise<void>;
    /** Credit stock quantity to account. */
    creditStock(accountId: string, symbol: string, quantity: number): Promise<void>;
}
//# sourceMappingURL=redis-balance-repository.d.ts.map
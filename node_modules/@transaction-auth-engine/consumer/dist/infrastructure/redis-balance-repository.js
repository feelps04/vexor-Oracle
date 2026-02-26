"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisBalanceRepository = void 0;
const BALANCE_PREFIX = 'balance:';
const BALANCE_BTC_PREFIX = 'balance_btc:';
const BALANCE_STOCK_PREFIX = 'balance_stock:';
const DEFAULT_INITIAL_BALANCE = 10_000;
/** Atomic balance check + debit (avoids race between GET and DECRBY). Returns 1=approved, 0=denied. */
const DEBITA_SALDO_LUA = `
local key = KEYS[1]
local amount = tonumber(ARGV[1])
local initial = tonumber(ARGV[2])
local balance = redis.call('get', key)
if balance == false then
  redis.call('set', key, initial)
  balance = initial
else
  balance = tonumber(balance)
end
if balance >= amount then
  redis.call('decrby', key, amount)
  return 1
else
  return 0
end
`;
/** Credit BTC (satoshis). Key created with 0 if missing, then INCRBY. */
const CREDIT_BTC_LUA = `
local key = KEYS[1]
local amount = tonumber(ARGV[1])
if redis.call('exists', key) == 0 then
  redis.call('set', key, 0)
end
redis.call('incrby', key, amount)
return 1
`;
class RedisBalanceRepository {
    redis;
    initialBalance;
    constructor(redis, initialBalance = DEFAULT_INITIAL_BALANCE) {
        this.redis = redis;
        this.initialBalance = initialBalance;
    }
    async getBalance(accountId) {
        const key = `${BALANCE_PREFIX}${accountId}`;
        const value = await this.redis.get(key);
        if (value === null) {
            await this.redis.set(key, this.initialBalance.toString());
            return this.initialBalance;
        }
        return parseInt(value, 10);
    }
    async debit(accountId, amount) {
        const ok = await this.tryDebit(accountId, amount);
        if (!ok) {
            throw new Error(`Insufficient balance for account ${accountId}`);
        }
    }
    /** Atomic check + debit via Lua script to prevent race conditions. */
    async tryDebit(accountId, amount) {
        const key = `${BALANCE_PREFIX}${accountId}`;
        const result = await this.redis.eval(DEBITA_SALDO_LUA, 1, key, String(amount), String(this.initialBalance));
        return result === 1;
    }
    /** Credit BTC to account (amount in minor units / satoshis). */
    async creditBtc(accountId, amountMinor) {
        if (amountMinor <= 0)
            return;
        const key = `${BALANCE_BTC_PREFIX}${accountId}`;
        await this.redis.eval(CREDIT_BTC_LUA, 1, key, String(amountMinor));
    }
    /** Credit stock quantity to account. */
    async creditStock(accountId, symbol, quantity) {
        if (quantity <= 0)
            return;
        const key = `${BALANCE_STOCK_PREFIX}${accountId}:${symbol}`;
        await this.redis.eval(CREDIT_BTC_LUA, 1, key, String(Math.floor(quantity)));
    }
}
exports.RedisBalanceRepository = RedisBalanceRepository;
//# sourceMappingURL=redis-balance-repository.js.map
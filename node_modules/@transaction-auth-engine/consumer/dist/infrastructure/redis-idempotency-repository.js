"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisIdempotencyRepository = void 0;
const IDEMPOTENCY_PREFIX = 'idempotency:';
const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours
class RedisIdempotencyRepository {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    async tryAcquire(key) {
        const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
        const value = JSON.stringify({
            status: 'PROCESSING',
            acquiredAt: new Date().toISOString(),
        });
        const result = await this.redis.set(redisKey, value, 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');
        return result === 'OK';
    }
    async complete(key, result) {
        const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
        const value = JSON.stringify({
            status: 'COMPLETED',
            result: { authorized: result.authorized, status: result.status },
        });
        await this.redis.set(redisKey, value, 'EX', IDEMPOTENCY_TTL_SECONDS);
    }
}
exports.RedisIdempotencyRepository = RedisIdempotencyRepository;
//# sourceMappingURL=redis-idempotency-repository.js.map
import type Redis from 'ioredis';
import type {
  IdempotencyRepository,
  IdempotencyResult,
} from '@transaction-auth-engine/shared';

const IDEMPOTENCY_PREFIX = 'idempotency:';
const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

export class RedisIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly redis: Redis) {}

  async tryAcquire(key: string): Promise<boolean> {
    const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
    const value = JSON.stringify({
      status: 'PROCESSING',
      acquiredAt: new Date().toISOString(),
    });
    const result = await this.redis.set(
      redisKey,
      value,
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
      'NX'
    );
    return result === 'OK';
  }

  async complete(key: string, result: IdempotencyResult): Promise<void> {
    const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
    const value = JSON.stringify({
      status: 'COMPLETED',
      result: { authorized: result.authorized, status: result.status },
    });
    await this.redis.set(redisKey, value, 'EX', IDEMPOTENCY_TTL_SECONDS);
  }
}

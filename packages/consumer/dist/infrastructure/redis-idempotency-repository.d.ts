import type Redis from 'ioredis';
import type { IdempotencyRepository, IdempotencyResult } from '@transaction-auth-engine/shared';
export declare class RedisIdempotencyRepository implements IdempotencyRepository {
    private readonly redis;
    constructor(redis: Redis);
    tryAcquire(key: string): Promise<boolean>;
    complete(key: string, result: IdempotencyResult): Promise<void>;
}
//# sourceMappingURL=redis-idempotency-repository.d.ts.map
import type { FastifyInstance } from 'fastify';
import type { ApiKafkaProducer } from '../infrastructure/kafka-producer.js';
import type Redis from 'ioredis';
export declare function transactionRoutes(app: FastifyInstance, opts: {
    producer: ApiKafkaProducer;
    redis?: Redis;
}): Promise<void>;
//# sourceMappingURL=transactions.d.ts.map
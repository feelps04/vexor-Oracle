import type { FastifyInstance } from 'fastify';
import type { ApiKafkaProducer } from '../infrastructure/kafka-producer.js';
import { MercadoBitcoinClient, BrapiClient } from '@transaction-auth-engine/shared';
import type Redis from 'ioredis';
export declare function orderRoutes(app: FastifyInstance, opts: {
    producer: ApiKafkaProducer;
    redis?: Redis;
    mercadoBitcoin: MercadoBitcoinClient;
    brapi: BrapiClient;
}): Promise<void>;
//# sourceMappingURL=orders.d.ts.map
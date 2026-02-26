"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionKafkaProducer = void 0;
const kafkajs_1 = require("kafkajs");
const TOPIC_PENDING = 'transactions.pending';
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 50;
class TransactionKafkaProducer {
    kafka;
    producer = null;
    batchSize;
    batchDelayMs;
    logger;
    pending = [];
    flushTimer = null;
    constructor(config) {
        this.kafka = new kafkajs_1.Kafka({
            clientId: 'transaction-producer',
            brokers: config.brokers,
        });
        this.batchSize = config.batchSize ?? BATCH_SIZE;
        this.batchDelayMs = config.batchDelayMs ?? BATCH_DELAY_MS;
        this.logger = config.logger;
    }
    async connect() {
        this.producer = this.kafka.producer();
        await this.producer.connect();
        this.logger.info('Kafka producer connected');
    }
    async disconnect() {
        await this.flush();
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        if (this.producer) {
            await this.producer.disconnect();
            this.producer = null;
            this.logger.info('Kafka producer disconnected');
        }
    }
    async send(transaction) {
        const key = transaction.accountId;
        const value = JSON.stringify(transaction.toJSON());
        this.pending.push({ key, value });
        if (this.pending.length >= this.batchSize) {
            await this.flush();
        }
        else if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => {
                this.flushTimer = null;
                this.flush().catch((err) => this.logger.error({ err }, 'Batch flush error'));
            }, this.batchDelayMs);
        }
    }
    async flush() {
        if (this.pending.length === 0 || !this.producer)
            return;
        const messages = this.pending.splice(0, this.pending.length);
        const record = {
            topic: TOPIC_PENDING,
            compression: kafkajs_1.CompressionTypes.GZIP,
            messages: messages.map((m) => ({ key: m.key, value: m.value })),
        };
        await this.producer.send(record);
        this.logger.debug({ count: messages.length }, 'Batch sent');
        if (this.pending.length > 0 && !this.flushTimer) {
            this.flushTimer = setTimeout(() => {
                this.flushTimer = null;
                this.flush().catch((err) => this.logger.error({ err }, 'Scheduled batch flush error'));
            }, this.batchDelayMs);
        }
    }
    async sendBatch(transactions) {
        if (!this.producer)
            throw new Error('Producer not connected');
        const messages = transactions.map((t) => ({
            key: t.accountId,
            value: JSON.stringify(t.toJSON()),
        }));
        const record = {
            topic: TOPIC_PENDING,
            compression: kafkajs_1.CompressionTypes.GZIP,
            messages,
        };
        await this.producer.send(record);
        this.logger.debug({ count: messages.length }, 'Batch sent');
    }
}
exports.TransactionKafkaProducer = TransactionKafkaProducer;
//# sourceMappingURL=kafka-producer.js.map
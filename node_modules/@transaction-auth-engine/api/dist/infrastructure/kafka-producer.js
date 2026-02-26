"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKafkaProducer = void 0;
const kafkajs_1 = require("kafkajs");
const TOPIC_PENDING = 'transactions.pending';
class ApiKafkaProducer {
    kafka;
    producer = null;
    enabled = true;
    constructor(config) {
        this.kafka = new kafkajs_1.Kafka({
            clientId: 'transaction-api',
            brokers: config.brokers,
            retry: { retries: 0 },
            logLevel: kafkajs_1.logLevel.NOTHING,
        });
    }
    async connect() {
        try {
            this.producer = this.kafka.producer();
            await this.producer.connect();
            this.enabled = true;
        }
        catch {
            this.producer = null;
            this.enabled = false;
        }
    }
    async disconnect() {
        if (this.producer) {
            await this.producer.disconnect();
            this.producer = null;
        }
    }
    async sendTransaction(transaction) {
        if (!this.enabled)
            return;
        if (!this.producer)
            throw new Error('Producer not connected');
        await this.producer.send({
            topic: TOPIC_PENDING,
            compression: kafkajs_1.CompressionTypes.GZIP,
            messages: [
                {
                    key: transaction.accountId,
                    value: JSON.stringify(transaction.toJSON()),
                },
            ],
        });
    }
    isEnabled() {
        return this.enabled;
    }
}
exports.ApiKafkaProducer = ApiKafkaProducer;
//# sourceMappingURL=kafka-producer.js.map
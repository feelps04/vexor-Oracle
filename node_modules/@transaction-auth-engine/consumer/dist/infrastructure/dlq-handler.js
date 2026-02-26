"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DLQHandler = void 0;
const DLQ_TOPIC = 'transactions.dlq';
const HEADER_REASON = 'x-dlq-reason';
const HEADER_RETRY_COUNT = 'x-dlq-retry-count';
const HEADER_TIMESTAMP = 'x-dlq-timestamp';
class DLQHandler {
    kafka;
    logger;
    producer = null;
    constructor(kafka, logger) {
        this.kafka = kafka;
        this.logger = logger;
    }
    async connect() {
        this.producer = this.kafka.producer();
        await this.producer.connect();
    }
    async disconnect() {
        if (this.producer) {
            await this.producer.disconnect();
            this.producer = null;
        }
    }
    async send(message) {
        if (!this.producer)
            throw new Error('DLQ producer not connected');
        const value = JSON.stringify(message.originalPayload);
        await this.producer.send({
            topic: DLQ_TOPIC,
            messages: [
                {
                    value,
                    headers: {
                        [HEADER_REASON]: message.reason,
                        [HEADER_RETRY_COUNT]: String(message.retryCount),
                        [HEADER_TIMESTAMP]: new Date().toISOString(),
                    },
                },
            ],
        });
        this.logger.warn({
            reason: message.reason,
            retryCount: message.retryCount,
        }, 'Message sent to DLQ');
    }
}
exports.DLQHandler = DLQHandler;
//# sourceMappingURL=dlq-handler.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotifierConsumer = void 0;
const kafkajs_1 = require("kafkajs");
const webhook_dispatcher_js_1 = require("./webhook-dispatcher.js");
const TOPIC_AUTHORIZED = 'transactions.authorized';
class NotifierConsumer {
    kafka;
    groupId;
    consumer = null;
    logger;
    dispatcher;
    constructor(config) {
        this.kafka = new kafkajs_1.Kafka({
            clientId: 'notifier-consumer',
            brokers: config.brokers,
        });
        this.groupId = config.groupId;
        this.logger = config.logger;
        this.dispatcher = new webhook_dispatcher_js_1.WebhookDispatcher({
            webhookBaseUrl: config.webhookBaseUrl,
            logger: config.logger,
        });
    }
    async connect() {
        this.consumer = this.kafka.consumer({ groupId: this.groupId });
        await this.consumer.connect();
        await this.consumer.subscribe({ topic: TOPIC_AUTHORIZED, fromBeginning: false });
        this.logger.info('Notifier consumer connected');
    }
    async disconnect() {
        if (this.consumer) {
            await this.consumer.disconnect();
            this.consumer = null;
        }
        this.logger.info('Notifier consumer disconnected');
    }
    async run() {
        if (!this.consumer)
            throw new Error('Consumer not connected');
        await this.consumer.run({
            eachMessage: async (payload) => {
                await this.handleMessage(payload);
            },
        });
    }
    async handleMessage(payload) {
        const { message } = payload;
        const value = message.value?.toString();
        if (!value) {
            this.logger.warn({ offset: message.offset }, 'Empty message, skipping');
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(value);
        }
        catch (err) {
            this.logger.error({ err, offset: message.offset }, 'Invalid message');
            return;
        }
        try {
            await this.dispatcher.notify(parsed);
        }
        catch (err) {
            this.logger.error({ err, transactionId: parsed.id, merchantId: parsed.merchantId }, 'Webhook notify failed (message will be redelivered or go to DLQ if retries exhausted)');
            throw err;
        }
    }
}
exports.NotifierConsumer = NotifierConsumer;

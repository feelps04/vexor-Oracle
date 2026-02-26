"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const kafkajs_1 = require("kafkajs");
const shared_1 = require("@transaction-auth-engine/shared");
const TOPIC = 'opportunities.buy';
const JUSTIFICATION_TEMPLATE = 'O ativo está em tendência de queda de curto prazo, ideal para aporte fracionado.';
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
function parseMessage(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
async function main() {
    const logger = (0, shared_1.createLogger)('opportunity-justifier');
    const kafka = new kafkajs_1.Kafka({ clientId: 'opportunity-justifier', brokers: KAFKA_BROKERS });
    const consumer = kafka.consumer({ groupId: 'opportunity-justifier-group' });
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
    await consumer.run({
        eachMessage: async ({ message }) => {
            const value = message.value?.toString();
            if (!value)
                return;
            const msg = parseMessage(value);
            if (!msg)
                return;
            const justification = process.env.OPENAI_API_KEY
                ? await justifyWithLLM(msg)
                : JUSTIFICATION_TEMPLATE;
            logger.info({
                currentPrice: msg.currentPrice,
                movingAvg5m: msg.movingAvg5m,
                reason: msg.reason,
                justification,
            }, '[Oportunidade de compra] Justificativa gerada');
        },
    });
    const shutdown = async () => {
        await consumer.disconnect();
        logger.info('opportunity-justifier stopped');
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
/** Optional: call OpenAI to generate justification. Falls back to template on error. */
async function justifyWithLLM(msg) {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey)
            return JUSTIFICATION_TEMPLATE;
        const body = {
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'Você é um analista financeiro. Responda em uma frase objetiva em português.',
                },
                {
                    role: 'user',
                    content: `Preço atual BTC: R$ ${msg.currentPrice}. Média móvel 5 min: R$ ${msg.movingAvg5m}. O preço está 2% abaixo da média. Gere uma justificativa financeira curta para oportunidade de compra.`,
                },
            ],
            max_tokens: 80,
        };
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        });
        if (!res.ok)
            return JUSTIFICATION_TEMPLATE;
        const data = (await res.json());
        const text = data?.choices?.[0]?.message?.content?.trim();
        return text || JUSTIFICATION_TEMPLATE;
    }
    catch {
        return JUSTIFICATION_TEMPLATE;
    }
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map
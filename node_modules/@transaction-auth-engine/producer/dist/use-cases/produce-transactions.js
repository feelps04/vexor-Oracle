"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runProduceLoop = runProduceLoop;
const transaction_generator_js_1 = require("../infrastructure/transaction-generator.js");
const DEFAULT_TPS = 1000;
const MIN_BATCH = 50;
const MAX_BATCH = 100;
async function runProduceLoop(producer, logger, config = {}) {
    const tps = config.transactionsPerSecond ?? Number(process.env.TRANSACTIONS_PER_SECOND) ?? DEFAULT_TPS;
    const batchMin = config.batchSizeMin ?? MIN_BATCH;
    const batchMax = config.batchSizeMax ?? MAX_BATCH;
    const intervalMs = 50;
    const batchSize = Math.min(MAX_BATCH, Math.max(MIN_BATCH, Math.floor(tps / (1000 / intervalMs))));
    const targetPerTick = Math.min(batchSize, Math.ceil((tps * intervalMs) / 1000));
    logger.info({ tps, batchSize: targetPerTick, intervalMs }, 'Starting transaction producer loop');
    setInterval(async () => {
        try {
            const batch = (0, transaction_generator_js_1.generateTransactionBatch)(targetPerTick, config.generatorOptions);
            await producer.sendBatch(batch);
        }
        catch (err) {
            logger.error({ err }, 'Produce loop error');
        }
    }, intervalMs);
}

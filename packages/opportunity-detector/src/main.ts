import { Kafka, type Consumer, type Producer } from 'kafkajs';
import { createLogger } from '@transaction-auth-engine/shared';

const TOPIC_TICKER = 'btc.ticker';
const TOPIC_OPPORTUNITIES = 'opportunities.buy';
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const THRESHOLD_PCT = 0.98; // emit when current < 98% of moving average

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');

interface TickerMessage {
  timestamp: string;
  priceBRL: number;
}

function parseTicker(value: string): TickerMessage | null {
  try {
    const o = JSON.parse(value) as { timestamp?: string; priceBRL?: number };
    if (o?.priceBRL == null || !Number.isFinite(o.priceBRL)) return null;
    return {
      timestamp: o.timestamp ?? new Date().toISOString(),
      priceBRL: Number(o.priceBRL),
    };
  } catch {
    return null;
  }
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function main(): Promise<void> {
  const logger = createLogger('opportunity-detector');
  const kafka = new Kafka({ clientId: 'opportunity-detector', brokers: KAFKA_BROKERS });

  const consumer: Consumer = kafka.consumer({ groupId: 'opportunity-detector-group' });
  const producer: Producer = kafka.producer();

  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: TOPIC_TICKER, fromBeginning: false });

  const buffer: { ts: number; price: number }[] = [];
  const now = (): number => Date.now();

  await consumer.run({
    eachMessage: async ({ message }) => {
      const value = message.value?.toString();
      if (!value) return;
      const ticker = parseTicker(value);
      if (!ticker) return;

      const ts = new Date(ticker.timestamp).getTime();
      const price = ticker.priceBRL;
      buffer.push({ ts, price });

      const cutoff = now() - WINDOW_MS;
      while (buffer.length > 0 && buffer[0].ts < cutoff) {
        buffer.shift();
      }

      if (buffer.length < 2) return;

      const prices = buffer.map((p) => p.price);
      const movingAvg5m = average(prices);
      const currentPrice = price;

      if (movingAvg5m > 0 && currentPrice < THRESHOLD_PCT * movingAvg5m) {
        const payload = JSON.stringify({
          timestamp: new Date().toISOString(),
          currentPrice,
          movingAvg5m,
          reason: 'below_2pct',
        });
        await producer.send({
          topic: TOPIC_OPPORTUNITIES,
          messages: [{ key: 'btc-opportunity', value: payload }],
        });
        logger.info(
          { currentPrice, movingAvg5m, pct: (currentPrice / movingAvg5m) * 100 },
          'Emitted buy opportunity (price below 98% of 5m MA)'
        );
      }
    },
  });

  const shutdown = async (): Promise<void> => {
    await consumer.disconnect();
    await producer.disconnect();
    logger.info('opportunity-detector stopped');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

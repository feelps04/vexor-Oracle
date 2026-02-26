/**
 * Latency sensor for external APIs (BrasilAPI, AwesomeAPI, etc.).
 * Used by the Kafka consumer to apply backpressure when APIs are slow:
 * increase pause between messages so the system "breathes" instead of exploding memory.
 */

const DEFAULT_WINDOW_SIZE = 20;
const DEFAULT_HIGH_LATENCY_MS = 2000;
const DEFAULT_BACKPRESSURE_MS = 1500;
const MAX_BACKPRESSURE_MS = 10000;

export interface LatencySensorConfig {
  /** Number of recent samples to consider. */
  windowSize?: number;
  /** When recent avg latency exceeds this (ms), apply backpressure. */
  highLatencyThresholdMs?: number;
  /** Pause (ms) to apply between messages when under backpressure. */
  backpressurePauseMs?: number;
  /** Max pause (ms) to avoid infinite slowdown. */
  maxBackpressureMs?: number;
}

export class LatencySensor {
  private readonly windowSize: number;
  private readonly highLatencyThresholdMs: number;
  private readonly backpressurePauseMs: number;
  private readonly maxBackpressureMs: number;
  private readonly samples: number[] = [];

  constructor(config: LatencySensorConfig = {}) {
    this.windowSize = config.windowSize ?? DEFAULT_WINDOW_SIZE;
    this.highLatencyThresholdMs = config.highLatencyThresholdMs ?? DEFAULT_HIGH_LATENCY_MS;
    this.backpressurePauseMs = config.backpressurePauseMs ?? DEFAULT_BACKPRESSURE_MS;
    this.maxBackpressureMs = config.maxBackpressureMs ?? MAX_BACKPRESSURE_MS;
  }

  /** Record an external API call latency (ms). */
  record(latencyMs: number): void {
    this.samples.push(latencyMs);
    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }
  }

  /** Average of recent samples. */
  getAverageLatencyMs(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  /**
   * Returns the pause (ms) to apply before processing the next message.
   * 0 = no backpressure; >0 = slow down to let external APIs catch up.
   */
  getCurrentBackpressureMs(): number {
    const avg = this.getAverageLatencyMs();
    if (avg < this.highLatencyThresholdMs) return 0;
    const ratio = avg / this.highLatencyThresholdMs;
    const pause = Math.min(
      this.maxBackpressureMs,
      Math.round(this.backpressurePauseMs * Math.min(ratio, 4))
    );
    return pause;
  }

  /** For metrics/dashboard: whether we are currently under backpressure. */
  isUnderBackpressure(): boolean {
    return this.getCurrentBackpressureMs() > 0;
  }
}

/**
 * Latency sensor for external APIs (BrasilAPI, AwesomeAPI, etc.).
 * Used by the Kafka consumer to apply backpressure when APIs are slow:
 * increase pause between messages so the system "breathes" instead of exploding memory.
 */
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
export declare class LatencySensor {
    private readonly windowSize;
    private readonly highLatencyThresholdMs;
    private readonly backpressurePauseMs;
    private readonly maxBackpressureMs;
    private readonly samples;
    constructor(config?: LatencySensorConfig);
    /** Record an external API call latency (ms). */
    record(latencyMs: number): void;
    /** Average of recent samples. */
    getAverageLatencyMs(): number;
    /**
     * Returns the pause (ms) to apply before processing the next message.
     * 0 = no backpressure; >0 = slow down to let external APIs catch up.
     */
    getCurrentBackpressureMs(): number;
    /** For metrics/dashboard: whether we are currently under backpressure. */
    isUnderBackpressure(): boolean;
}
//# sourceMappingURL=latency-sensor.d.ts.map
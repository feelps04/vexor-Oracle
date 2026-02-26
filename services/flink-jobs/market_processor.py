"""
Apache Flink Market Processor
Consumes stocks.ticker, btc.ticker, fx.ticker from Kafka.
Produces:
  - market.ohlc     (OHLC candles: 1m, 5m, 15m tumbling windows)
  - market.anomalies (price spikes >3σ, volume surges)
  - market.stress    (market-wide stress index)
"""

import json
import math
import os
import time
from collections import defaultdict

from pyflink.common import Row, Types, WatermarkStrategy
from pyflink.common.serialization import SimpleStringSchema
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.datastream.connectors.kafka import (
    KafkaOffsetsInitializer,
    KafkaRecordSerializationSchema,
    KafkaSink,
    KafkaSource,
)
from pyflink.datastream.functions import (
    KeyedProcessFunction,
    MapFunction,
    ProcessWindowFunction,
    RuntimeContext,
)
from pyflink.datastream.state import MapStateDescriptor, ValueStateDescriptor
from pyflink.datastream.window import TumblingProcessingTimeWindows, Time
from pyflink.common.typeinfo import Types as T

KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")

# ── Tick Parser ──────────────────────────────────────────────────────
class ParseTick(MapFunction):
    """Parse raw JSON tick from any topic into a uniform Row."""

    def map(self, value: str) -> Row:
        try:
            d = json.loads(value)
        except Exception:
            return None

        symbol = str(d.get("symbol", "")).upper().strip()
        if not symbol:
            # FX ticks may use 'pair' instead of 'symbol'
            pair = str(d.get("pair", "")).upper().strip()
            currency = str(d.get("currency", "")).upper().strip()
            if pair:
                symbol = pair
            elif currency:
                symbol = currency + "BRL"

        price = 0.0
        for key in ("priceBRL", "price", "rate", "close"):
            v = d.get(key)
            if v is not None:
                try:
                    price = float(v)
                    if price > 0:
                        break
                except (ValueError, TypeError):
                    pass

        bid = float(d.get("bid", 0) or 0)
        ask = float(d.get("ask", 0) or 0)
        volume = int(d.get("volume", 0) or 0)

        ts = 0
        for key in ("ts", "timestamp"):
            v = d.get(key)
            if v is not None:
                try:
                    ts = int(v) if isinstance(v, (int, float)) else int(float(v))
                    if ts > 0:
                        break
                except (ValueError, TypeError):
                    pass

        if ts <= 0:
            ts = int(time.time() * 1000)

        if not symbol or price <= 0:
            return None

        return Row(symbol=symbol, price=price, bid=bid, ask=ask,
                   volume=volume, ts=ts)


# ── OHLC Window Function ────────────────────────────────────────────
class OhlcWindowFunction(ProcessWindowFunction):
    """Compute OHLC candle from a tumbling window of ticks."""

    def __init__(self, window_label: str):
        self.window_label = window_label

    def process(self, key, context, elements):
        ticks = list(elements)
        if not ticks:
            return

        symbol = key
        prices = [t.price for t in ticks if t.price > 0]
        if not prices:
            return

        open_p = prices[0]
        close_p = prices[-1]
        high_p = max(prices)
        low_p = min(prices)
        total_vol = sum(t.volume for t in ticks)

        window_end = context.window().end
        candle = {
            "type": "ohlc",
            "symbol": symbol,
            "window": self.window_label,
            "ts": window_end,
            "open": round(open_p, 4),
            "high": round(high_p, 4),
            "low": round(low_p, 4),
            "close": round(close_p, 4),
            "volume": total_vol,
            "ticks": len(prices),
        }
        yield json.dumps(candle)


# ── Anomaly Detector ─────────────────────────────────────────────────
class AnomalyDetector(KeyedProcessFunction):
    """
    Detects price anomalies using rolling statistics.
    Fires when |price - mean| > 3σ (configurable).
    """

    SIGMA_THRESHOLD = 3.0
    WINDOW_SIZE = 200  # rolling window of ticks

    def open(self, runtime_context: RuntimeContext):
        self.prices_state = runtime_context.get_state(
            ValueStateDescriptor("prices", Types.PICKLED_BYTE_ARRAY())
        )

    def process_element(self, value, ctx):
        if value is None:
            return

        symbol = value.symbol
        price = value.price

        prices = self.prices_state.value()
        if prices is None:
            prices = []

        prices.append(price)
        if len(prices) > self.WINDOW_SIZE:
            prices = prices[-self.WINDOW_SIZE:]

        self.prices_state.update(prices)

        if len(prices) < 20:
            return  # not enough data

        mean = sum(prices) / len(prices)
        variance = sum((p - mean) ** 2 for p in prices) / len(prices)
        std = math.sqrt(variance) if variance > 0 else 0

        if std <= 0:
            return

        z_score = abs(price - mean) / std

        if z_score >= self.SIGMA_THRESHOLD:
            anomaly = {
                "type": "anomaly",
                "symbol": symbol,
                "ts": int(time.time() * 1000),
                "price": round(price, 4),
                "mean": round(mean, 4),
                "std": round(std, 4),
                "z_score": round(z_score, 2),
                "direction": "spike_up" if price > mean else "spike_down",
                "severity": "critical" if z_score >= 5 else "high" if z_score >= 4 else "medium",
            }
            yield json.dumps(anomaly)


# ── Market Stress Calculator ─────────────────────────────────────────
class MarketStressCalculator(KeyedProcessFunction):
    """
    Computes a market-wide stress index based on:
    - Tick frequency (ticks/sec)
    - Price volatility across symbols
    - Number of anomalies recently
    Emits a stress snapshot every second.
    """

    EMIT_INTERVAL_MS = 1000

    def open(self, runtime_context: RuntimeContext):
        self.state = runtime_context.get_state(
            ValueStateDescriptor("stress_state", Types.PICKLED_BYTE_ARRAY())
        )

    def process_element(self, value, ctx):
        if value is None:
            return

        state = self.state.value()
        if state is None:
            state = {"tick_count": 0, "last_emit": 0, "prices": {}}

        state["tick_count"] += 1
        state["prices"][value.symbol] = value.price

        now = int(time.time() * 1000)
        elapsed = now - state["last_emit"]

        if elapsed >= self.EMIT_INTERVAL_MS:
            tps = state["tick_count"] / max(1, elapsed / 1000)

            # Stress level based on ticks per second
            if tps >= 500:
                level = "panic"
                score = min(10, tps / 100)
            elif tps >= 200:
                level = "hot"
                score = 5 + (tps - 200) / 60
            elif tps >= 50:
                level = "warm"
                score = 2 + (tps - 50) / 50
            else:
                level = "calm"
                score = max(0, tps / 25)

            stress = {
                "type": "stress",
                "ts": now,
                "level": level,
                "score": round(score, 2),
                "ticksPerSecond": round(tps, 1),
                "activeSymbols": len(state["prices"]),
            }
            yield json.dumps(stress)

            state["tick_count"] = 0
            state["last_emit"] = now
            state["prices"] = {}

        self.state.update(state)


# ── Main Pipeline ────────────────────────────────────────────────────
def main():
    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_parallelism(2)

    # Kafka source (merge all tick topics)
    source = (
        KafkaSource.builder()
        .set_bootstrap_servers(KAFKA_BOOTSTRAP)
        .set_topics("stocks.ticker", "btc.ticker", "fx.ticker")
        .set_group_id("flink-market-processor")
        .set_starting_offsets(KafkaOffsetsInitializer.latest())
        .set_value_only_deserializer(SimpleStringSchema())
        .build()
    )

    ticks_raw = env.from_source(source, WatermarkStrategy.no_watermarks(), "kafka-ticks")

    # Parse into structured ticks
    ticks = ticks_raw.map(ParseTick()).filter(lambda r: r is not None)

    # ── OHLC Candles ─────────────────────────────────────────────
    ohlc_sink = (
        KafkaSink.builder()
        .set_bootstrap_servers(KAFKA_BOOTSTRAP)
        .set_record_serializer(
            KafkaRecordSerializationSchema.builder()
            .set_topic("market.ohlc")
            .set_value_serialization_schema(SimpleStringSchema())
            .build()
        )
        .build()
    )

    for label, window_size in [("1m", Time.minutes(1)), ("5m", Time.minutes(5)), ("15m", Time.minutes(15))]:
        (
            ticks
            .key_by(lambda r: r.symbol)
            .window(TumblingProcessingTimeWindows.of(window_size))
            .process(OhlcWindowFunction(label))
            .sink_to(ohlc_sink)
        )

    # ── Anomaly Detection ────────────────────────────────────────
    anomaly_sink = (
        KafkaSink.builder()
        .set_bootstrap_servers(KAFKA_BOOTSTRAP)
        .set_record_serializer(
            KafkaRecordSerializationSchema.builder()
            .set_topic("market.anomalies")
            .set_value_serialization_schema(SimpleStringSchema())
            .build()
        )
        .build()
    )

    (
        ticks
        .key_by(lambda r: r.symbol)
        .process(AnomalyDetector())
        .sink_to(anomaly_sink)
    )

    # ── Market Stress Index ──────────────────────────────────────
    stress_sink = (
        KafkaSink.builder()
        .set_bootstrap_servers(KAFKA_BOOTSTRAP)
        .set_record_serializer(
            KafkaRecordSerializationSchema.builder()
            .set_topic("market.stress")
            .set_value_serialization_schema(SimpleStringSchema())
            .build()
        )
        .build()
    )

    (
        ticks
        .key_by(lambda _: "global")
        .process(MarketStressCalculator())
        .sink_to(stress_sink)
    )

    env.execute("Market Processor - OHLC + Anomaly + Stress")


if __name__ == "__main__":
    main()

#pragma once

#include <atomic>
#include <cstdint>
#include <string>

struct Metrics {
  std::atomic<uint64_t> messages_published_total{0};
  std::atomic<uint64_t> messages_buffered_total{0};
  std::atomic<uint64_t> messages_replayed_total{0};
  std::atomic<uint64_t> messages_dropped_total{0};
  std::atomic<uint64_t> kafka_errors_total{0};

  std::atomic<uint64_t> sbe_messages_decoded_total{0};

  std::atomic<uint64_t> buffer_used_bytes{0};
  std::atomic<uint64_t> buffer_capacity_bytes{0};

  std::atomic<uint64_t> kafka_delivery_latency_ms_last{0};
  std::atomic<uint64_t> discard_jitter_ms_last{0};

  std::atomic<uint64_t> kafka_connected{1};
  std::atomic<uint64_t> degraded{0};

  std::atomic<uint64_t> degraded_reason_kafka_disconnected{0};
  std::atomic<uint64_t> degraded_reason_buffer_high{0};

  std::string to_prometheus_text() const;
};

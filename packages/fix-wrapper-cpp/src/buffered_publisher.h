#pragma once

#include "kafka_producer.h"
#include "metrics.h"
#include "redis_status.h"
#include "ring_buffer.h"

#include <cstdint>
#include <string>

class BufferedPublisher {
public:
  struct Config {
    std::string data_topic;
    std::string system_topic;

    size_t buffer_bytes;

    double degraded_buffer_high_pct;
    double degraded_buffer_clear_pct;

    uint32_t redis_ttl_seconds;
  };

  BufferedPublisher(std::string brokers, Config cfg, Metrics& metrics, RedisStatus* redis);

  bool publish_data(uint64_t seq_num, uint64_t ts_ingest_ms, const std::string& key, const std::string& payload);

  void tick();

private:
  void emit_system_event(const std::string& status, const std::string& extraJsonFields);
  void update_degraded_state();
  void maybe_recovery_probe();

  std::string brokers_;
  Config cfg_;

  Metrics& metrics_;
  RedisStatus* redis_;

  KafkaProducer data_producer_;
  KafkaProducer system_producer_;

  RingBuffer buffer_;

  bool kafka_down_ = false;
  uint64_t last_seq_published_ = 0;

  uint64_t last_probe_ms_ = 0;
  uint32_t probe_interval_ms_ = 500;
  size_t max_replay_per_tick_ = 5000;
};

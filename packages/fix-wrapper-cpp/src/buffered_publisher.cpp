#include "buffered_publisher.h"

#include <chrono>
#include <cstring>
#include <cstdlib>
#include <sstream>

static uint64_t now_ms() {
  return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
                                      std::chrono::system_clock::now().time_since_epoch())
                                  .count());
}

BufferedPublisher::BufferedPublisher(std::string brokers, Config cfg, Metrics& metrics, RedisStatus* redis)
  : brokers_(std::move(brokers))
  , cfg_(std::move(cfg))
  , metrics_(metrics)
  , redis_(redis)
  , data_producer_(brokers_, cfg_.data_topic)
  , system_producer_(brokers_, cfg_.system_topic)
  , buffer_(cfg_.buffer_bytes) {
  metrics_.buffer_capacity_bytes.store(cfg_.buffer_bytes);
}

bool BufferedPublisher::publish_data(uint64_t seq_num, uint64_t ts_ingest_ms, const std::string& key, const std::string& payload) {
  const uint64_t ts_publish_ms = now_ms();

  std::ostringstream json;
  json << "{";
  json << "\"type\":\"tick\",";
  json << "\"seq_num\":" << seq_num << ",";
  json << "\"ts_ingest_ms\":" << ts_ingest_ms << ",";
  json << "\"ts_publish_ms\":" << ts_publish_ms << ",";
  json << "\"is_replay\":false,";
  json << payload.substr(1);

  const std::string msg = json.str();

  const bool ok = data_producer_.publish(key, msg) && data_producer_.is_healthy();
  if (ok) {
    metrics_.messages_published_total.fetch_add(1);
    metrics_.kafka_connected.store(1);
    kafka_down_ = false;
    last_seq_published_ = seq_num;

    const uint64_t latency = ts_publish_ms >= ts_ingest_ms ? (ts_publish_ms - ts_ingest_ms) : 0;
    metrics_.kafka_delivery_latency_ms_last.store(latency);

    return true;
  }

  metrics_.kafka_errors_total.fetch_add(1);
  metrics_.kafka_connected.store(0);

  if (!kafka_down_) {
    kafka_down_ = true;
    emit_system_event("kafka_down", std::string("\"last_seq_published\":") + std::to_string(last_seq_published_));
  }

  RingBuffer::Frame f{};
  f.seq_num = seq_num;
  f.ts_ingest_ms = ts_ingest_ms;
  f.ts_publish_ms = 0;
  f.is_replay = false;
  f.key = key;
  f.payload = msg;

  const size_t dropped = buffer_.push_drop_oldest(std::move(f));
  metrics_.messages_buffered_total.fetch_add(1);
  metrics_.buffer_used_bytes.store(buffer_.used_bytes());

  if (dropped > 0) {
    metrics_.messages_dropped_total.fetch_add(dropped);
    metrics_.discard_jitter_ms_last.store(buffer_.last_drop_jitter_ms());

    std::ostringstream extra;
    extra << "\"dropped\":" << dropped << ",";
    extra << "\"buffer_used_bytes\":" << buffer_.used_bytes() << ",";
    extra << "\"buffer_capacity_bytes\":" << buffer_.capacity_bytes() << ",";
    extra << "\"last_seq_published\":" << last_seq_published_;

    emit_system_event("data_loss", extra.str());
  }

  update_degraded_state();
  return false;
}

void BufferedPublisher::tick() {
  maybe_recovery_probe();

  if (!data_producer_.is_healthy()) {
    metrics_.kafka_connected.store(0);
    update_degraded_state();
    return;
  }

  size_t replayed = 0;

  while (replayed < max_replay_per_tick_) {
    auto fr = buffer_.pop();
    if (!fr.has_value()) break;

    auto frame = std::move(fr.value());

    const uint64_t ts_publish_ms = now_ms();

    std::string msg = frame.payload;
    const size_t pos = msg.find("\"is_replay\":false");
    if (pos != std::string::npos) {
      msg.replace(pos, ::strlen("\"is_replay\":false"), "\"is_replay\":true");
    }

    const bool ok = data_producer_.publish(frame.key, msg) && data_producer_.is_healthy();
    if (!ok) {
      metrics_.kafka_errors_total.fetch_add(1);
      metrics_.kafka_connected.store(0);

      frame.is_replay = true;
      frame.ts_publish_ms = 0;
      frame.payload = std::move(msg);
      buffer_.push_drop_oldest(std::move(frame));
      break;
    }

    metrics_.messages_published_total.fetch_add(1);
    metrics_.messages_replayed_total.fetch_add(1);
    metrics_.kafka_connected.store(1);

    last_seq_published_ = frame.seq_num;
    replayed++;

    const uint64_t latency = ts_publish_ms >= frame.ts_ingest_ms ? (ts_publish_ms - frame.ts_ingest_ms) : 0;
    metrics_.kafka_delivery_latency_ms_last.store(latency);
  }

  metrics_.buffer_used_bytes.store(buffer_.used_bytes());

  if (kafka_down_ && metrics_.kafka_connected.load() == 1) {
    kafka_down_ = false;

    std::ostringstream extra;
    extra << "\"recovered\":" << replayed << ",";
    extra << "\"last_seq_published\":" << last_seq_published_;

    emit_system_event("kafka_up", extra.str());
  }

  update_degraded_state();
}

void BufferedPublisher::maybe_recovery_probe() {
  const uint64_t now = now_ms();

  if (data_producer_.is_healthy()) {
    return;
  }

  if (last_probe_ms_ != 0 && (now - last_probe_ms_) < probe_interval_ms_) {
    return;
  }
  last_probe_ms_ = now;

  std::ostringstream json;
  json << "{";
  json << "\"type\":\"probe\",";
  json << "\"ts\":" << now;
  json << "}";

  (void)data_producer_.publish_probe("probe", json.str());
  (void)data_producer_.flush(50);
  if (!data_producer_.is_healthy()) {
    (void)data_producer_.publish_probe("probe", json.str());
    (void)data_producer_.flush(50);
  }

  if (data_producer_.is_healthy()) {
    metrics_.kafka_connected.store(1);

    std::ostringstream extra;
    extra << "\"recovered\":0,";
    extra << "\"last_seq_published\":" << last_seq_published_;
    emit_system_event("kafka_up", extra.str());

    update_degraded_state();
  }
}

void BufferedPublisher::emit_system_event(const std::string& status, const std::string& extraJsonFields) {
  std::ostringstream json;
  json << "{";
  json << "\"type\":\"system_event\",";
  json << "\"status\":\"" << status << "\",";
  json << "\"ts\":" << now_ms();
  if (!extraJsonFields.empty()) {
    json << "," << extraJsonFields;
  }
  json << "}";

  system_producer_.publish("system", json.str());
}

void BufferedPublisher::update_degraded_state() {
  const double sat = buffer_.saturation_level();
  const bool kafkaDisconnected = metrics_.kafka_connected.load() == 0;

  bool degraded = metrics_.degraded.load() != 0;

  if (!degraded) {
    if (kafkaDisconnected) {
      degraded = true;
      metrics_.degraded_reason_kafka_disconnected.store(1);
      metrics_.degraded_reason_buffer_high.store(0);
      if (redis_) redis_->set_degraded("kafka_disconnected", cfg_.redis_ttl_seconds);
    } else if (sat >= cfg_.degraded_buffer_high_pct) {
      degraded = true;
      metrics_.degraded_reason_kafka_disconnected.store(0);
      metrics_.degraded_reason_buffer_high.store(1);
      if (redis_) redis_->set_degraded("buffer_high", cfg_.redis_ttl_seconds);
    }
  } else {
    if (!kafkaDisconnected && sat <= cfg_.degraded_buffer_clear_pct) {
      degraded = false;
      metrics_.degraded_reason_kafka_disconnected.store(0);
      metrics_.degraded_reason_buffer_high.store(0);
      if (redis_) redis_->clear_degraded(cfg_.redis_ttl_seconds);
    } else {
      if (redis_) {
        if (kafkaDisconnected) redis_->set_degraded("kafka_disconnected", cfg_.redis_ttl_seconds);
        else if (sat >= cfg_.degraded_buffer_high_pct) redis_->set_degraded("buffer_high", cfg_.redis_ttl_seconds);
      }
    }
  }

  metrics_.degraded.store(degraded ? 1 : 0);
}

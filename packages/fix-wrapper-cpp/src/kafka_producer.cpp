#include "kafka_producer.h"

#include <chrono>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <mutex>

#include <librdkafka/rdkafkacpp.h>

namespace {
class DeliveryCb final : public RdKafka::DeliveryReportCb {
public:
  void dr_cb(RdKafka::Message& message) override {
    std::lock_guard<std::mutex> g(mu_);
    if (message.err() != RdKafka::ERR_NO_ERROR) {
      healthy_ = false;
      last_err_ = message.err();
      last_err_str_ = message.errstr();
      return;
    }

    healthy_ = true;
    last_err_ = RdKafka::ERR_NO_ERROR;
    last_err_str_.clear();
  }

  bool healthy() const {
    std::lock_guard<std::mutex> g(mu_);
    return healthy_;
  }

  void mark_unhealthy() {
    std::lock_guard<std::mutex> g(mu_);
    healthy_ = false;
  }

private:
  mutable std::mutex mu_;
  bool healthy_ = true;
  RdKafka::ErrorCode last_err_ = RdKafka::ERR_NO_ERROR;
  std::string last_err_str_;
};
}

struct KafkaProducer::Impl {
  std::unique_ptr<RdKafka::Producer> producer;
  std::unique_ptr<DeliveryCb> deliveryCb;
};

KafkaProducer::KafkaProducer(std::string brokers, std::string topic)
  : brokers_(std::move(brokers)), topic_(std::move(topic)), impl_(new Impl()) {
  std::string errstr;
  std::unique_ptr<RdKafka::Conf> conf(RdKafka::Conf::create(RdKafka::Conf::CONF_GLOBAL));
  if (!conf) throw std::runtime_error("Failed to create Kafka conf");

  auto set_or_warn = [&](const char* confKey, const char* value) {
    if (conf->set(confKey, value, errstr) != RdKafka::Conf::CONF_OK) {
      std::cerr << "Kafka conf " << confKey << "=" << value << " failed: " << errstr << std::endl;
    }
  };

  auto set_if_env = [&](const char* envName, const char* confKey) {
    const char* v = std::getenv(envName);
    if (!v || !*v) return;
    if (conf->set(confKey, v, errstr) != RdKafka::Conf::CONF_OK) {
      std::cerr << "Kafka conf " << confKey << " (from " << envName << ") failed: " << errstr
                << std::endl;
    }
  };

  if (conf->set("bootstrap.servers", brokers_, errstr) != RdKafka::Conf::CONF_OK) {
    throw std::runtime_error("Kafka conf bootstrap.servers: " + errstr);
  }

  // Avoid any host environment IPv6 quirks.
  set_or_warn("broker.address.family", "v4");

  impl_->deliveryCb = std::make_unique<DeliveryCb>();
  if (conf->set("dr_cb", impl_->deliveryCb.get(), errstr) != RdKafka::Conf::CONF_OK) {
    throw std::runtime_error("Kafka conf dr_cb: " + errstr);
  }

  // Defaults tuned for local Docker Kafka. The previous 500ms timeouts were too aggressive
  // and caused ApiVersionRequest timeouts / flapping broker connectivity.
  set_or_warn("message.timeout.ms", "30000");
  set_or_warn("request.timeout.ms", "15000");
  set_or_warn("socket.timeout.ms", "15000");
  set_or_warn("socket.connection.setup.timeout.ms", "15000");

  // Help resilience during short broker restarts.
  set_or_warn("reconnect.backoff.ms", "200");
  set_or_warn("reconnect.backoff.max.ms", "2000");
  set_or_warn("retry.backoff.ms", "200");

  // Ensure ApiVersion handshake is attempted with enough time budget.
  set_or_warn("api.version.request", "true");

  set_or_warn("linger.ms", "0");
  set_or_warn("queue.buffering.max.ms", "0");

  set_if_env("FIX_WRAPPER_KAFKA_BATCH_SIZE", "batch.num.messages");
  set_if_env("FIX_WRAPPER_KAFKA_LINGER_MS", "linger.ms");
  set_if_env("FIX_WRAPPER_KAFKA_COMPRESSION", "compression.codec");
  set_if_env("FIX_WRAPPER_KAFKA_ACKS", "acks");
  set_if_env("FIX_WRAPPER_KAFKA_QUEUE_MAX_MSG", "queue.buffering.max.messages");
  set_if_env("FIX_WRAPPER_KAFKA_DEBUG", "debug");
  set_if_env("FIX_WRAPPER_KAFKA_MESSAGE_TIMEOUT_MS", "message.timeout.ms");
  set_if_env("FIX_WRAPPER_KAFKA_REQUEST_TIMEOUT_MS", "request.timeout.ms");
  set_if_env("FIX_WRAPPER_KAFKA_SOCKET_TIMEOUT_MS", "socket.timeout.ms");
  set_if_env("FIX_WRAPPER_KAFKA_CONN_SETUP_TIMEOUT_MS", "socket.connection.setup.timeout.ms");

  const char* logLevelEnv = std::getenv("FIX_WRAPPER_KAFKA_LOG_LEVEL");
  const char* logLevel = (logLevelEnv && *logLevelEnv) ? logLevelEnv : "3";
  set_or_warn("log_level", logLevel);

  const char* acksEnv = std::getenv("FIX_WRAPPER_KAFKA_ACKS");
  const bool acksSet = (acksEnv && *acksEnv);
  const bool acksIsAll = acksSet && (std::string(acksEnv) == "all" || std::string(acksEnv) == "-1");

  // If the user explicitly tunes acks for pure throughput (e.g. 0/1), idempotence must be disabled.
  // Otherwise librdkafka rejects the config at producer creation time.
  if (acksSet && !acksIsAll) {
    if (conf->set("enable.idempotence", "false", errstr) != RdKafka::Conf::CONF_OK) {
      std::cerr << "Kafka conf enable.idempotence=false failed: " << errstr << std::endl;
    }
  } else {
    if (conf->set("enable.idempotence", "true", errstr) != RdKafka::Conf::CONF_OK) {
      // ignore if not supported
    }
  }

  impl_->producer.reset(RdKafka::Producer::create(conf.get(), errstr));
  if (!impl_->producer) {
    throw std::runtime_error("Failed to create Kafka producer: " + errstr);
  }
}

KafkaProducer::~KafkaProducer() {
  if (!impl_) return;
  if (impl_->producer) {
    impl_->producer->flush(3000);
  }
  delete impl_;
  impl_ = nullptr;
}

bool KafkaProducer::publish(const std::string& key, const std::string& value) {
  if (!impl_ || !impl_->producer) return false;

  impl_->producer->poll(0);
  if (impl_->deliveryCb && !impl_->deliveryCb->healthy()) {
    return false;
  }

  auto produce = [&]() -> bool {
    static uint64_t last_err_log_ms = 0;

    const auto* keyPtr = key.empty() ? nullptr : key.data();
    const size_t keyLen = key.empty() ? 0 : key.size();

    RdKafka::ErrorCode rc = impl_->producer->produce(
      topic_,
      RdKafka::Topic::PARTITION_UA,
      RdKafka::Producer::RK_MSG_COPY,
      const_cast<char*>(value.data()),
      value.size(),
      keyPtr,
      keyLen,
      0,
      nullptr
    );

    if (rc != RdKafka::ERR_NO_ERROR) {
      const auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
                         std::chrono::system_clock::now().time_since_epoch())
                         .count();
      if (static_cast<uint64_t>(now) - last_err_log_ms >= 1000) {
        last_err_log_ms = static_cast<uint64_t>(now);
        std::cerr << "Kafka produce failed: " << RdKafka::err2str(rc) << std::endl;
      }
      if (impl_->deliveryCb) impl_->deliveryCb->mark_unhealthy();
      return false;
    }

    impl_->producer->poll(0);
    return true;
  };

  return produce();
}

bool KafkaProducer::publish_probe(const std::string& key, const std::string& value) {
  if (!impl_ || !impl_->producer) return false;
  impl_->producer->poll(0);

  auto produce = [&]() -> bool {
    static uint64_t last_err_log_ms = 0;

    const auto* keyPtr = key.empty() ? nullptr : key.data();
    const size_t keyLen = key.empty() ? 0 : key.size();

    RdKafka::ErrorCode rc = impl_->producer->produce(
      topic_,
      RdKafka::Topic::PARTITION_UA,
      RdKafka::Producer::RK_MSG_COPY,
      const_cast<char*>(value.data()),
      value.size(),
      keyPtr,
      keyLen,
      0,
      nullptr
    );

    if (rc != RdKafka::ERR_NO_ERROR) {
      const auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
                         std::chrono::system_clock::now().time_since_epoch())
                         .count();
      if (static_cast<uint64_t>(now) - last_err_log_ms >= 1000) {
        last_err_log_ms = static_cast<uint64_t>(now);
        std::cerr << "Kafka produce failed: " << RdKafka::err2str(rc) << std::endl;
      }
      if (impl_->deliveryCb) impl_->deliveryCb->mark_unhealthy();
      return false;
    }

    impl_->producer->poll(0);
    return true;
  };

  return produce();
}

bool KafkaProducer::flush(int timeoutMs) {
  if (!impl_ || !impl_->producer) return false;
  impl_->producer->poll(0);
  const int rc = impl_->producer->flush(timeoutMs);
  impl_->producer->poll(0);
  return rc == 0;
}

bool KafkaProducer::is_healthy() const {
  if (!impl_ || !impl_->producer) return false;
  if (!impl_->deliveryCb) return true;
  return impl_->deliveryCb->healthy();
}

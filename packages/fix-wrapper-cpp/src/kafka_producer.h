#pragma once

#include <string>

class KafkaProducer {
public:
  KafkaProducer(std::string brokers, std::string topic);
  ~KafkaProducer();

  bool publish(const std::string& key, const std::string& value);

  bool publish_probe(const std::string& key, const std::string& value);

  bool flush(int timeoutMs);

  bool is_healthy() const;

private:
  KafkaProducer(const KafkaProducer&) = delete;
  KafkaProducer& operator=(const KafkaProducer&) = delete;

  std::string brokers_;
  std::string topic_;

  struct Impl;
  Impl* impl_;
};

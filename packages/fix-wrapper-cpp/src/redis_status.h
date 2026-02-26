#pragma once

#include <cstdint>
#include <string>

class RedisStatus {
public:
  RedisStatus(std::string host, uint16_t port);

  bool set_degraded(const std::string& reason, uint32_t ttlSeconds);
  bool clear_degraded(uint32_t ttlSeconds);

private:
  std::string host_;
  uint16_t port_;
};

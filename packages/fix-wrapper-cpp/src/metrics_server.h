#pragma once

#include "metrics.h"

#include <cstdint>
#include <memory>

struct mg_context;
struct mg_connection;

class MetricsServer {
public:
  MetricsServer(uint16_t port, const Metrics& metrics);
  ~MetricsServer();

  MetricsServer(const MetricsServer&) = delete;
  MetricsServer& operator=(const MetricsServer&) = delete;

private:
  static int handle_request(mg_connection* conn, void* cbdata);

  const Metrics& metrics_;
  mg_context* ctx_ = nullptr;
};

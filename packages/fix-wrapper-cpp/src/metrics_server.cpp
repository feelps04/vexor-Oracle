#include "metrics_server.h"

#include <civetweb.h>

#include <iostream>
#include <stdexcept>
#include <string>

MetricsServer::MetricsServer(uint16_t port, const Metrics& metrics) : metrics_(metrics) {
  std::string portStr = std::to_string(port);

  const char* options[] = {
    "listening_ports",
    portStr.c_str(),
    "num_threads",
    "2",
    nullptr
  };

  mg_callbacks callbacks{};
  ctx_ = mg_start(&callbacks, nullptr, options);
  if (!ctx_) {
    std::cerr << "Failed to start civetweb on port " << port << std::endl;
    throw std::runtime_error("Failed to start civetweb");
  }

  mg_set_request_handler(ctx_, "/metrics", &MetricsServer::handle_request, this);
}

MetricsServer::~MetricsServer() {
  if (ctx_) {
    mg_stop(ctx_);
    ctx_ = nullptr;
  }
}

int MetricsServer::handle_request(mg_connection* conn, void* cbdata) {
  auto* self = static_cast<MetricsServer*>(cbdata);
  if (!self) return 500;

  const std::string body = self->metrics_.to_prometheus_text();
  mg_printf(conn,
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/plain; version=0.0.4\r\n"
            "Content-Length: %zu\r\n"
            "\r\n",
            body.size());
  mg_write(conn, body.data(), body.size());
  return 200;
}

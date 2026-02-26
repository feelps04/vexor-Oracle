#include "metrics.h"

#include <sstream>

std::string Metrics::to_prometheus_text() const {
  const uint64_t cap = buffer_capacity_bytes.load();
  const uint64_t used = buffer_used_bytes.load();
  double sat = 0.0;
  if (cap > 0) {
    sat = (static_cast<double>(used) * 100.0) / static_cast<double>(cap);
  }

  std::ostringstream out;
  out << "# TYPE fix_wrapper_messages_published_total counter\n";
  out << "fix_wrapper_messages_published_total " << messages_published_total.load() << "\n";
  out << "# TYPE fix_wrapper_messages_buffered_total counter\n";
  out << "fix_wrapper_messages_buffered_total " << messages_buffered_total.load() << "\n";
  out << "# TYPE fix_wrapper_messages_replayed_total counter\n";
  out << "fix_wrapper_messages_replayed_total " << messages_replayed_total.load() << "\n";
  out << "# TYPE fix_wrapper_messages_dropped_total counter\n";
  out << "fix_wrapper_messages_dropped_total " << messages_dropped_total.load() << "\n";
  out << "# TYPE fix_wrapper_kafka_errors_total counter\n";
  out << "fix_wrapper_kafka_errors_total " << kafka_errors_total.load() << "\n";

  out << "# TYPE fix_wrapper_sbe_messages_decoded_total counter\n";
  out << "fix_wrapper_sbe_messages_decoded_total " << sbe_messages_decoded_total.load() << "\n";

  out << "# TYPE fix_wrapper_buffer_capacity_bytes gauge\n";
  out << "fix_wrapper_buffer_capacity_bytes " << cap << "\n";
  out << "# TYPE fix_wrapper_buffer_used_bytes gauge\n";
  out << "fix_wrapper_buffer_used_bytes " << used << "\n";
  out << "# HELP fix_wrapper_buffer_saturation_level Saturacao do Ring Buffer\n";
  out << "# TYPE fix_wrapper_buffer_saturation_level gauge\n";
  out << "fix_wrapper_buffer_saturation_level " << sat << "\n";

  out << "# TYPE fix_wrapper_kafka_delivery_latency_ms_last gauge\n";
  out << "fix_wrapper_kafka_delivery_latency_ms_last " << kafka_delivery_latency_ms_last.load() << "\n";

  out << "# HELP fix_wrapper_discard_jitter_ms_last Idade (ms) do frame mais antigo descartado (drop-oldest)\n";
  out << "# TYPE fix_wrapper_discard_jitter_ms_last gauge\n";
  out << "fix_wrapper_discard_jitter_ms_last " << discard_jitter_ms_last.load() << "\n";

  out << "# TYPE fix_wrapper_kafka_connected gauge\n";
  out << "fix_wrapper_kafka_connected " << kafka_connected.load() << "\n";
  out << "# TYPE fix_wrapper_degraded gauge\n";
  out << "fix_wrapper_degraded " << degraded.load() << "\n";

  out << "# TYPE fix_wrapper_degraded_reason_kafka_disconnected gauge\n";
  out << "fix_wrapper_degraded_reason_kafka_disconnected " << degraded_reason_kafka_disconnected.load() << "\n";
  out << "# TYPE fix_wrapper_degraded_reason_buffer_high gauge\n";
  out << "fix_wrapper_degraded_reason_buffer_high " << degraded_reason_buffer_high.load() << "\n";

  return out.str();
}

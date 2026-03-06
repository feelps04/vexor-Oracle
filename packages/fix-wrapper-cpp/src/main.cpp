#include "buffered_publisher.h"
#include "metrics_server.h"

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include <OnixS/FIXEngine.h>
#include <OnixS/FIXEngine/FIX/ISbeDecodeListener.h>
#include <OnixS/FIXEngine/FIX/SBE.h>
#include <OnixS/FIXEngine/FIX/SbeEventBasedDecoder.h>

static std::string getenvOr(const char* k, const char* defv) {
  const char* v = std::getenv(k);
  if (v && *v) return std::string(v);
  return std::string(defv);
}

static size_t getenvSizeOr(const char* k, size_t defv) {
  const char* v = std::getenv(k);
  if (!v || !*v) return defv;
  try {
    return static_cast<size_t>(std::stoull(v));
  } catch (...) {
    return defv;
  }
}

static uint16_t getenvU16Or(const char* k, uint16_t defv) {
  const char* v = std::getenv(k);
  if (!v || !*v) return defv;
  try {
    return static_cast<uint16_t>(std::stoul(v));
  } catch (...) {
    return defv;
  }
}

static uint64_t now_ms() {
  return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
                                    std::chrono::system_clock::now().time_since_epoch())
                                  .count());
}

static std::optional<std::string> read_file_all(const std::string& path) {
  std::ifstream f(path, std::ios::in | std::ios::binary);
  if (!f.is_open()) return std::nullopt;
  std::ostringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

static bool getenvBoolOr(const char* k, bool defv) {
  const char* v = std::getenv(k);
  if (!v || !*v) return defv;
  const std::string s(v);
  if (s == "1" || s == "true" || s == "TRUE" || s == "yes" || s == "YES") return true;
  if (s == "0" || s == "false" || s == "FALSE" || s == "no" || s == "NO") return false;
  return defv;
}

static uint32_t getenvU32Or(const char* k, uint32_t defv) {
  const char* v = std::getenv(k);
  if (!v || !*v) return defv;
  try {
    return static_cast<uint32_t>(std::stoul(v));
  } catch (...) {
    return defv;
  }
}

static const char* kSbeTickTemplatesXml = R"XML(<?xml version="1.0" encoding="UTF-8"?>
<sbe:messageSchema xmlns:sbe="http://fixprotocol.io/2016/sbe" package="b3.test" id="1" version="1" semanticVersion="1.0">
  <types>
    <composite name="messageHeader" description="SBE message header">
      <type name="blockLength" primitiveType="uint16"/>
      <type name="templateId" primitiveType="uint16"/>
      <type name="schemaId" primitiveType="uint16"/>
      <type name="version" primitiveType="uint16"/>
    </composite>

    <type name="Symbol" primitiveType="char" length="6" characterEncoding="ASCII"/>

    <composite name="Decimal" description="FIX decimal">
      <type name="mantissa" primitiveType="int64"/>
      <type name="exponent" primitiveType="int8"/>
    </composite>
  </types>

  <message name="Tick" id="15" description="Synthetic Tick">
    <field name="symbol" type="Symbol" id="55"/>
    <field name="price" type="Decimal" id="44"/>
    <field name="quantity" type="uint32" id="38"/>
  </message>
</sbe:messageSchema>
)XML";

class B3SbeHandler final : public OnixS::FIX::SBE::IDecodeListener {
public:
  explicit B3SbeHandler(BufferedPublisher& pub) : pub_(pub) {
    source_ = getenvOr("FIX_WRAPPER_SOURCE", "b3-sbe");
  }

  void onBeginMessage(unsigned templateId, const char* messageType, size_t messageTypeLength) override {
    template_id_ = templateId;
    message_type_.assign(messageType ? messageType : "", messageTypeLength);
    symbol_.clear();
    price_mantissa_.reset();
    price_exponent_.reset();
    qty_.reset();
  }

  void onEndMessage() override {
    const uint64_t ts = now_ms();
    const uint64_t seq = ++seq_;

    std::ostringstream payload;
    payload << "{";
    payload << "\"template_id\":" << template_id_ << ",";
    payload << "\"message_type\":\"" << message_type_ << "\"";

    if (!symbol_.empty()) {
      payload << ",\"symbol\":\"" << symbol_ << "\"";
    }

    if (price_mantissa_.has_value() && price_exponent_.has_value()) {
      payload << ",\"price_mantissa\":" << price_mantissa_.value();
      payload << ",\"price_exponent\":" << price_exponent_.value();

      const double mant = static_cast<double>(price_mantissa_.value());
      const int exp = price_exponent_.value();
      const double px = mant * std::pow(10.0, static_cast<double>(exp));
      if (std::isfinite(px)) {
        payload << ",\"priceBRL\":" << px;
      }
    }

    if (qty_.has_value()) {
      payload << ",\"qty\":" << qty_.value();
    }

    if (!source_.empty()) {
      payload << ",\"source\":\"" << source_ << "\"";
    }

    payload << "}";

    const std::string key = !symbol_.empty() ? symbol_ : "sbe";
    pub_.publish_data(seq, ts, key, payload.str());
    pub_.tick();
  }

  void onValue(int tag, char value) override {
    (void)tag;
    (void)value;
  }

  void onValue(int tag, short value) override {
    (void)tag;
    (void)value;
  }

  void onValue(int tag, unsigned short value) override {
    (void)tag;
    (void)value;
  }

  void onValue(int tag, int value) override {
    if (tag == 38) {
      qty_ = static_cast<long long>(value);
    }
  }

  void onValue(int tag, unsigned value) override {
    if (tag == 38) {
      qty_ = static_cast<long long>(value);
    }
  }

  void onValue(int tag, long long value) override {
    if (tag == 38) {
      qty_ = value;
    }
  }

  void onValue(int tag, unsigned long long value) override {
    if (tag == 38) {
      qty_ = static_cast<long long>(value);
    }
  }

  void onValue(int tag, long long mantissa, int exponent) override {
    if (tag == 44) {
      price_mantissa_ = mantissa;
      price_exponent_ = exponent;
    }
  }

  void onValue(int tag, const char* value, size_t valueLength) override {
    if (tag == 55 && value) {
      symbol_.assign(value, valueLength);
    }
  }

  void onValue(int tag, float value) override {
    (void)tag;
    (void)value;
  }

  void onValue(int tag, double value) override {
    (void)tag;
    (void)value;
  }

  void onBeginSequence(int tag, size_t itemCount) override {
    (void)tag;
    (void)itemCount;
  }

  void onEndSequence() override {
  }

  void onBeginSequenceEntry(size_t index) override {
    (void)index;
  }

  void onEndSequenceEntry() override {
  }

private:
  BufferedPublisher& pub_;
  uint64_t seq_ = 0;
  unsigned template_id_ = 0;
  std::string message_type_;

  std::string source_;

  std::string symbol_;
  std::optional<long long> price_mantissa_;
  std::optional<int> price_exponent_;
  std::optional<long long> qty_;
};

class SbeTrafficGenerator {
public:
  SbeTrafficGenerator(BufferedPublisher& pub, Metrics& metrics, uint32_t rateHz)
    : pub_(pub)
    , metrics_(metrics)
    , rate_hz_(rateHz == 0 ? 1u : rateHz)
    , dict_(OnixS::FIX::SBE::Decoder::generateFixDictionary(kSbeTickTemplatesXml))
    , encoder_(kSbeTickTemplatesXml)
    , decoder_(kSbeTickTemplatesXml)
    , handler_(pub_) {
  }

  void run_forever() {
    std::vector<unsigned char> buf(512);
    const uint64_t interval_ns = 1000000000ull / static_cast<uint64_t>(rate_hz_);
    const auto interval = std::chrono::nanoseconds(interval_ns == 0 ? 1 : interval_ns);
    auto next = std::chrono::steady_clock::now();

    while (true) {
      const auto now = std::chrono::steady_clock::now();
      if (now < next) {
        // For very high rates (e.g. 2M/s), sleeping is not precise enough.
        // We pace by timestamp with a tiny yield loop to reduce CPU jitter.
        do {
          std::this_thread::yield();
        } while (std::chrono::steady_clock::now() < next);
      }
      next += interval;

      try {
        OnixS::FIX::Message msg("X", dict_);
        msg.set(55, "PETR4");
        msg.set(44, OnixS::FIX::Decimal(1023, -2));
        msg.set(38, 100u);

        size_t rootBlockLength = 0;
        size_t usedSize = encoder_.encodeWithHeader(msg, 15, 1, buf.data(), buf.size(), &rootBlockLength);

        size_t decodedBytes = 0;
        decoder_.decodeSingleMessage(15, 1, rootBlockLength, buf.data(), 0, usedSize, &handler_, &decodedBytes);
        metrics_.sbe_messages_decoded_total.fetch_add(1);

        pub_.tick();
      } catch (const std::exception& ex) {
        std::cout << "SBE stress error: " << ex.what() << std::endl;
        return;
      }
    }
  }

private:
  BufferedPublisher& pub_;
  Metrics& metrics_;
  uint32_t rate_hz_;
  OnixS::FIX::Dictionary dict_;
  OnixS::FIX::SBE::Encoder encoder_;
  OnixS::FIX::SBE::EventBasedDecoder decoder_;
  B3SbeHandler handler_;
};

int main() {
  const std::string brokers = getenvOr("KAFKA_BROKERS", "kafka:9092");
  const std::string topic = getenvOr("FIX_WRAPPER_KAFKA_TOPIC", "stocks.ticker");
  const std::string systemTopic = getenvOr("FIX_WRAPPER_SYSTEM_TOPIC", "system.events");

  const std::string onixsLicenseStore = getenvOr("ONIXS_LICENSE_STORE", "/opt/onixs/license");

  const std::string sbeTemplatesPath = getenvOr("FIX_WRAPPER_SBE_TEMPLATES_XML", "");
  const bool sbeGenEnabled = getenvBoolOr("FIX_WRAPPER_SBE_GEN_ENABLED", false);
  const uint32_t sbeGenRateHz = getenvU32Or("FIX_WRAPPER_SBE_GEN_RATE_HZ", 10000);
  const bool stressTest = getenvBoolOr("FIX_WRAPPER_STRESS_TEST", false);
  const uint32_t stressRateHz = getenvU32Or("FIX_WRAPPER_STRESS_RATE_HZ", 100000);

  const bool simEnabled = getenvBoolOr("FIX_WRAPPER_SIM_ENABLED", false);

  const size_t bufferBytes = getenvSizeOr("FIX_WRAPPER_BUFFER_BYTES", 500ull * 1024ull * 1024ull);
  const uint16_t metricsPort = getenvU16Or("FIX_WRAPPER_METRICS_PORT", 9109);

  const std::string redisHost = getenvOr("REDIS_HOST", "redis");
  const uint16_t redisPort = getenvU16Or("REDIS_PORT", 6379);

  std::cout << "fix-wrapper-cpp starting" << std::endl;
  std::cout << "OnixS FIX Engine SDK loaded" << std::endl;
  std::cout << "Kafka brokers: " << brokers << " topic: " << topic << " system: " << systemTopic << std::endl;

  try {
    OnixS::FIX::EngineSettings engineSettings;
    engineSettings.listenPort(-1);
    if (!onixsLicenseStore.empty()) {
      engineSettings.licenseStore(onixsLicenseStore);
    }
    OnixS::FIX::Engine::init(engineSettings);
  } catch (const std::exception& ex) {
    std::cout << "OnixS Engine init failed: " << ex.what() << std::endl;
    return 3;
  }

  Metrics metrics;
  MetricsServer metricsServer(metricsPort, metrics);

  RedisStatus redis(redisHost, redisPort);

  BufferedPublisher::Config cfg;
  cfg.data_topic = topic;
  cfg.system_topic = systemTopic;
  cfg.buffer_bytes = bufferBytes;
  cfg.degraded_buffer_high_pct = 70.0;
  cfg.degraded_buffer_clear_pct = 50.0;
  cfg.redis_ttl_seconds = 10;

  BufferedPublisher pub(brokers, cfg, metrics, &redis);

  if (stressTest) {
    std::cout << "SBE stress test enabled (rate_hz=" << stressRateHz << ")" << std::endl;
    SbeTrafficGenerator gen(pub, metrics, stressRateHz);
    gen.run_forever();
  }

  if (sbeGenEnabled) {
    std::cout << "SBE traffic generator enabled (rate_hz=" << sbeGenRateHz << ")" << std::endl;
    SbeTrafficGenerator gen(pub, metrics, sbeGenRateHz);
    gen.run_forever();
  }

  std::optional<OnixS::FIX::SBE::EventBasedDecoder> sbeDecoder;
  std::optional<B3SbeHandler> sbeHandler;

  if (!sbeTemplatesPath.empty()) {
    const auto xml = read_file_all(sbeTemplatesPath);
    if (xml.has_value()) {
      sbeDecoder.emplace(xml.value());
      sbeHandler.emplace(pub);
      std::cout << "SBE templates loaded from: " << sbeTemplatesPath << std::endl;
    } else {
      std::cout << "Failed to read SBE templates: " << sbeTemplatesPath << std::endl;
    }
  }

  uint64_t seq = 1;
  while (true) {
    if (sbeDecoder.has_value() && sbeHandler.has_value()) {
      pub.tick();
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
      continue;
    }

    if (!simEnabled) {
      pub.tick();
      std::this_thread::sleep_for(std::chrono::milliseconds(250));
      continue;
    }

    // Skeleton payload: a fake tick. Replace this with real FIX/FAST/SBE decode.
    const long long tsMs = (long long)std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::system_clock::now().time_since_epoch()
    ).count();

    const std::string sym = getenvOr("FIX_WRAPPER_SIM_SYMBOL", "PETR4");
    const double price = 10.0 + (seq % 100) * 0.01;

    std::string json = "{";
    json += "\"symbol\":\"" + sym + "\",";
    json += "\"priceBRL\":" + std::to_string(price) + ",";
    json += "\"ts\":" + std::to_string(tsMs);
    json += "}";

    pub.publish_data(seq, static_cast<uint64_t>(tsMs), sym, json);
    pub.tick();

    seq++;
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }
}

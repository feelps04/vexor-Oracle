#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>

#pragma comment(lib, "Ws2_32.lib")

static std::string getenv_or(const char* k, const char* defv) {
  const char* v = std::getenv(k);
  if (v && *v) return std::string(v);
  return std::string(defv);
}

static int getenv_int_or(const char* k, int defv) {
  const char* v = std::getenv(k);
  if (!v || !*v) return defv;
  try {
    return std::stoi(v);
  } catch (...) {
    return defv;
  }
}

static double getenv_double_or(const char* k, double defv) {
  const char* v = std::getenv(k);
  if (!v || !*v) return defv;
  try {
    return std::stod(v);
  } catch (...) {
    return defv;
  }
}

static uint64_t now_ms() {
  return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
                                    std::chrono::system_clock::now().time_since_epoch())
                                  .count());
}

static std::string to_upper_ascii(std::string s) {
  for (auto& c : s) {
    if (c >= 'a' && c <= 'z') c = static_cast<char>(c - 'a' + 'A');
  }
  return s;
}

static std::string iso_utc_now() {
  SYSTEMTIME st;
  GetSystemTime(&st);
  char buf[64];
  std::snprintf(buf, sizeof(buf), "%04u-%02u-%02uT%02u:%02u:%02u.%03uZ", st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute,
                st.wSecond, st.wMilliseconds);
  return std::string(buf);
}

static bool send_tcp_line(const std::string& host, uint16_t port, const std::string& line) {
  WSADATA wsa;
  if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
    return false;
  }

  addrinfo hints;
  std::memset(&hints, 0, sizeof(hints));
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  hints.ai_protocol = IPPROTO_TCP;

  addrinfo* res = nullptr;
  const std::string port_s = std::to_string(port);
  if (getaddrinfo(host.c_str(), port_s.c_str(), &hints, &res) != 0 || !res) {
    WSACleanup();
    return false;
  }

  SOCKET s = INVALID_SOCKET;
  for (addrinfo* p = res; p; p = p->ai_next) {
    s = socket(p->ai_family, p->ai_socktype, p->ai_protocol);
    if (s == INVALID_SOCKET) continue;
    if (connect(s, p->ai_addr, static_cast<int>(p->ai_addrlen)) == 0) break;
    closesocket(s);
    s = INVALID_SOCKET;
  }

  freeaddrinfo(res);

  if (s == INVALID_SOCKET) {
    WSACleanup();
    return false;
  }

  const char* data = line.c_str();
  int remaining = static_cast<int>(line.size());
  while (remaining > 0) {
    int sent = send(s, data, remaining, 0);
    if (sent <= 0) {
      closesocket(s);
      WSACleanup();
      return false;
    }
    data += sent;
    remaining -= sent;
  }

  shutdown(s, SD_BOTH);
  closesocket(s);
  WSACleanup();
  return true;
}

static uint64_t random_u64() {
  uint64_t x = now_ms();
  x ^= (x << 13);
  x ^= (x >> 7);
  x ^= (x << 17);
  return x;
}

static std::string make_fix_like_order(const std::string& symbol, const std::string& side, int qty, double price, const std::string& clOrdId) {
  std::ostringstream ss;
  ss << "35=D";
  ss << "|11=" << clOrdId;
  ss << "|55=" << symbol;
  ss << "|54=" << (side == "BUY" ? "1" : "2");
  ss << "|38=" << qty;
  ss << "|44=" << std::fixed << std::setprecision(2) << price;
  ss << "|60=" << iso_utc_now();
  ss << "\n";
  return ss.str();
}

static double read_f64_le(const unsigned char* p) {
  double v;
  std::memcpy(&v, p, sizeof(v));
  return v;
}

static int32_t read_i32_le(const unsigned char* p) {
  int32_t v;
  std::memcpy(&v, p, sizeof(v));
  return v;
}

static int64_t read_i64_le(const unsigned char* p) {
  int64_t v;
  std::memcpy(&v, p, sizeof(v));
  return v;
}

static std::string read_symbol_ascii(const unsigned char* p, int maxBytes) {
  int n = 0;
  for (; n < maxBytes; n++) {
    if (p[n] == 0) break;
  }
  if (n <= 0) return std::string();
  std::string s(reinterpret_cast<const char*>(p), static_cast<size_t>(n));
  while (!s.empty() && (s.back() == ' ' || s.back() == '\t' || s.back() == '\r' || s.back() == '\n')) s.pop_back();
  return to_upper_ascii(s);
}

int main() {
  const std::string mmfName = getenv_or("MT5_SHARED_MEMORY_NAME", "B3RAM");
  const int recordBytes = getenv_int_or("MT5_RECORD_BYTES", 128);
  const int recordCount = getenv_int_or("MT5_RECORD_COUNT", 500);
  const int pollMs = getenv_int_or("MT5_POLL_MS", 50);

  const int bidOff = getenv_int_or("MT5_BID_OFFSET_BYTES", 0);
  const int askOff = getenv_int_or("MT5_ASK_OFFSET_BYTES", 8);
  const int volOff = getenv_int_or("MT5_VOLUME_OFFSET_BYTES", 16);
  const int tsOff = getenv_int_or("MT5_TIME_OFFSET_BYTES", 24);
  const int hbOff = getenv_int_or("MT5_HEARTBEAT_OFFSET_BYTES", 36);
  const int wfOff = getenv_int_or("MT5_WRITING_FLAG_OFFSET_BYTES", 40);
  const int symOff = getenv_int_or("MT5_SYMBOL_OFFSET_BYTES", 44);
  const int symBytes = getenv_int_or("MT5_SYMBOL_BYTES", 16);

  const std::string symbolTarget = to_upper_ascii(getenv_or("SYMBOL", "WINJ26"));

  const std::string execHost = getenv_or("EXEC_SIM_HOST", "127.0.0.1");
  const uint16_t execPort = static_cast<uint16_t>(getenv_int_or("EXEC_SIM_PORT", 9999));

  const double buyBelow = getenv_double_or("BUY_BELOW", -1.0);
  const int qty = getenv_int_or("QTY", 1);
  const int cooldownMs = getenv_int_or("COOLDOWN_MS", 30000);

  std::cout << "[sentinel-hybrid-mmf] start symbol=" << symbolTarget << " mmf=" << mmfName << " recordBytes=" << recordBytes
            << " recordCount=" << recordCount << " pollMs=" << pollMs << " exec=" << execHost << ":" << execPort
            << " buyBelow=" << buyBelow << " qty=" << qty << " cooldownMs=" << cooldownMs << std::endl;

  uint64_t lastOrderAt = 0;
  int lastHeartbeatSeen = -1;

  HANDLE hMap = nullptr;
  while (true) {
    hMap = OpenFileMappingW(FILE_MAP_READ, FALSE, std::wstring(mmfName.begin(), mmfName.end()).c_str());
    if (hMap) break;
    std::cerr << "[sentinel-hybrid-mmf] waiting for MMF '" << mmfName << "' err=" << GetLastError() << std::endl;
    std::this_thread::sleep_for(std::chrono::milliseconds(1000));
  }

  const size_t mapBytes = static_cast<size_t>(recordBytes) * static_cast<size_t>(recordCount);
  unsigned char* base = static_cast<unsigned char*>(MapViewOfFile(hMap, FILE_MAP_READ, 0, 0, mapBytes));
  if (!base) {
    std::cerr << "[sentinel-hybrid-mmf] MapViewOfFile failed err=" << GetLastError() << std::endl;
    CloseHandle(hMap);
    return 2;
  }

  while (true) {
    double bestPrice = -1.0;
    int bestHb = -1;
    int64_t bestTs = 0;

    for (int i = 0; i < recordCount; i++) {
      const size_t off = static_cast<size_t>(i) * static_cast<size_t>(recordBytes);
      const unsigned char* rec = base + off;

      if (wfOff >= 0 && wfOff + 4 <= recordBytes) {
        const int writing = read_i32_le(rec + wfOff);
        if (writing == 1) continue;
      }

      if (symOff < 0 || symOff + symBytes > recordBytes) continue;
      const std::string sym = read_symbol_ascii(rec + symOff, symBytes);
      if (sym.empty()) continue;
      if (sym != symbolTarget) continue;

      const int hb = (hbOff >= 0 && hbOff + 4 <= recordBytes) ? read_i32_le(rec + hbOff) : 0;
      const int64_t ts = (tsOff >= 0 && tsOff + 8 <= recordBytes) ? read_i64_le(rec + tsOff) : 0;

      double bid = (bidOff >= 0 && bidOff + 8 <= recordBytes) ? read_f64_le(rec + bidOff) : 0.0;
      double ask = (askOff >= 0 && askOff + 8 <= recordBytes) ? read_f64_le(rec + askOff) : 0.0;

      double price = (bid > 0.0) ? bid : ((ask > 0.0) ? ask : -1.0);
      if (!(price > 0.0)) continue;

      if (hb > bestHb) {
        bestHb = hb;
        bestTs = ts;
        bestPrice = price;
      } else if (hb == bestHb && ts > bestTs) {
        bestTs = ts;
        bestPrice = price;
      }
    }

    const uint64_t now = now_ms();

    if (bestPrice > 0.0) {
      if (bestHb != lastHeartbeatSeen) {
        lastHeartbeatSeen = bestHb;
        std::cout << "[sentinel-hybrid-mmf] tick symbol=" << symbolTarget << " price=" << std::fixed << std::setprecision(2)
                  << bestPrice << " hb=" << bestHb << " ts=" << bestTs << std::endl;
      }

      const bool buySignal = (buyBelow > 0.0) ? (bestPrice <= buyBelow) : false;
      if (buySignal) {
        if (cooldownMs > 0 && lastOrderAt > 0 && (now - lastOrderAt) < static_cast<uint64_t>(cooldownMs)) {
          std::cout << "[sentinel-hybrid-mmf] buy signal but cooldown active remainingMs="
                    << (static_cast<uint64_t>(cooldownMs) - (now - lastOrderAt)) << std::endl;
        } else {
          std::ostringstream id;
          id << "SENTINEL-" << now << "-" << (random_u64() & 0xFFFFull);
          const std::string clOrdId = id.str();

          const std::string msg = make_fix_like_order(symbolTarget, "BUY", qty, bestPrice, clOrdId);
          const bool ok = send_tcp_line(execHost, execPort, msg);
          if (ok) {
            lastOrderAt = now;
            std::cout << "[sentinel-hybrid-mmf] ORDER_SIM_SENT clOrdId=" << clOrdId << " symbol=" << symbolTarget
                      << " qty=" << qty << " price=" << std::fixed << std::setprecision(2) << bestPrice << std::endl;
          } else {
            std::cerr << "[sentinel-hybrid-mmf] ORDER_SIM_FAILED clOrdId=" << clOrdId << " host=" << execHost
                      << " port=" << execPort << std::endl;
          }
        }
      }
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(pollMs > 0 ? pollMs : 50));
  }

  UnmapViewOfFile(base);
  CloseHandle(hMap);
  return 0;
}

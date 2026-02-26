#include "ring_buffer.h"

#include <algorithm>
#include <chrono>
#include <cstring>

namespace {
constexpr uint8_t kWrapMarkerFlag = 0xFF;

uint64_t now_ms() {
  return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
                                    std::chrono::system_clock::now().time_since_epoch())
                                  .count());
}
}

RingBuffer::RingBuffer(size_t capacityBytes) : capacity_bytes_(capacityBytes), buf_(capacityBytes) {
}

double RingBuffer::saturation_level() const {
  if (capacity_bytes_ == 0) return 0.0;
  return (static_cast<double>(used_bytes_) * 100.0) / static_cast<double>(capacity_bytes_);
}

size_t RingBuffer::align8(size_t n) const {
  return (n + 7u) & ~static_cast<size_t>(7u);
}

size_t RingBuffer::header_and_data_bytes(uint32_t keyLen, uint32_t payloadLen) const {
  return align8(sizeof(Header) + static_cast<size_t>(keyLen) + static_cast<size_t>(payloadLen));
}

size_t RingBuffer::frame_bytes(const Frame& f) const {
  return header_and_data_bytes(static_cast<uint32_t>(f.key.size()), static_cast<uint32_t>(f.payload.size()));
}

bool RingBuffer::read_header_at(size_t offset, Header& out) const {
  if (offset + sizeof(Header) > capacity_bytes_) return false;
  std::memcpy(&out, buf_.data() + offset, sizeof(Header));
  return true;
}

void RingBuffer::write_frame_at(size_t offset, const Frame& frame) {
  Header h{};
  h.seq_num = frame.seq_num;
  h.ts_ingest_ms = frame.ts_ingest_ms;
  h.ts_publish_ms = frame.ts_publish_ms;
  h.key_len = static_cast<uint32_t>(frame.key.size());
  h.payload_len = static_cast<uint32_t>(frame.payload.size());
  h.flags = frame.is_replay ? kFlagReplay : 0;

  std::memcpy(buf_.data() + offset, &h, sizeof(Header));
  size_t cursor = offset + sizeof(Header);

  if (h.key_len > 0) {
    std::memcpy(buf_.data() + cursor, frame.key.data(), h.key_len);
    cursor += h.key_len;
  }

  if (h.payload_len > 0) {
    std::memcpy(buf_.data() + cursor, frame.payload.data(), h.payload_len);
  }
}

std::optional<size_t> RingBuffer::next_frame_offset(size_t offset) const {
  Header h{};
  if (!read_header_at(offset, h)) return std::nullopt;

  if (h.flags == kWrapMarkerFlag && h.key_len == 0 && h.payload_len == 0) {
    return 0;
  }

  const size_t sz = header_and_data_bytes(h.key_len, h.payload_len);
  size_t next = offset + sz;
  if (next >= capacity_bytes_) next = 0;
  return next;
}

size_t RingBuffer::push_drop_oldest(Frame frame) {
  const size_t needed = frame_bytes(frame);
  if (needed == 0 || needed > capacity_bytes_) {
    return 0;
  }

  auto drop_one = [&]() -> bool {
    if (empty_ || size_frames_ == 0) return false;

    Header h{};
    if (!read_header_at(head_off_, h)) {
      empty_ = true;
      size_frames_ = 0;
      used_bytes_ = 0;
      head_off_ = tail_off_ = 0;
      return false;
    }

    if (h.flags == kWrapMarkerFlag && h.key_len == 0 && h.payload_len == 0) {
      used_bytes_ = (used_bytes_ >= sizeof(Header)) ? (used_bytes_ - sizeof(Header)) : 0;
      head_off_ = 0;
      return true;
    }

    const uint64_t now = now_ms();
    last_drop_jitter_ms_ = (now >= h.ts_ingest_ms) ? (now - h.ts_ingest_ms) : 0;

    const size_t sz = header_and_data_bytes(h.key_len, h.payload_len);
    used_bytes_ = (used_bytes_ >= sz) ? (used_bytes_ - sz) : 0;
    head_off_ += sz;
    if (head_off_ >= capacity_bytes_) head_off_ = 0;

    if (size_frames_ > 0) size_frames_--;
    if (size_frames_ == 0) {
      empty_ = true;
      tail_off_ = head_off_;
    }
    return true;
  };

  size_t dropped = 0;

  while ((capacity_bytes_ - used_bytes_) < needed) {
    if (!drop_one()) break;
    dropped++;
  }

  if ((capacity_bytes_ - used_bytes_) < needed) {
    return dropped;
  }

  if (!empty_) {
    const size_t remaining = capacity_bytes_ - tail_off_;
    if (remaining < needed) {
      if (remaining >= sizeof(Header)) {
        Header wrap{};
        wrap.flags = kWrapMarkerFlag;
        wrap.key_len = 0;
        wrap.payload_len = 0;
        std::memcpy(buf_.data() + tail_off_, &wrap, sizeof(Header));
        used_bytes_ += sizeof(Header);
      }
      tail_off_ = 0;

      while ((capacity_bytes_ - used_bytes_) < needed) {
        if (!drop_one()) break;
        dropped++;
      }

      if ((capacity_bytes_ - used_bytes_) < needed) {
        return dropped;
      }
    }
  }

  write_frame_at(tail_off_, frame);
  used_bytes_ += needed;
  size_frames_++;
  empty_ = false;

  tail_off_ += needed;
  if (tail_off_ >= capacity_bytes_) tail_off_ = 0;

  return dropped;
}

std::optional<RingBuffer::Frame> RingBuffer::pop() {
  if (empty_ || size_frames_ == 0) return std::nullopt;

  Header h{};
  if (!read_header_at(head_off_, h)) return std::nullopt;

  if (h.flags == kWrapMarkerFlag && h.key_len == 0 && h.payload_len == 0) {
    used_bytes_ = (used_bytes_ >= sizeof(Header)) ? (used_bytes_ - sizeof(Header)) : 0;
    head_off_ = 0;
    if (!read_header_at(head_off_, h)) return std::nullopt;
  }

  const size_t sz = header_and_data_bytes(h.key_len, h.payload_len);

  Frame out{};
  out.seq_num = h.seq_num;
  out.ts_ingest_ms = h.ts_ingest_ms;
  out.ts_publish_ms = h.ts_publish_ms;
  out.is_replay = (h.flags & kFlagReplay) != 0;

  size_t cursor = head_off_ + sizeof(Header);
  if (h.key_len > 0) {
    out.key.assign(reinterpret_cast<const char*>(buf_.data() + cursor), h.key_len);
    cursor += h.key_len;
  }

  if (h.payload_len > 0) {
    out.payload.assign(reinterpret_cast<const char*>(buf_.data() + cursor), h.payload_len);
  }

  used_bytes_ = (used_bytes_ >= sz) ? (used_bytes_ - sz) : 0;
  head_off_ += sz;
  if (head_off_ >= capacity_bytes_) head_off_ = 0;

  size_frames_--;
  if (size_frames_ == 0) {
    empty_ = true;
    tail_off_ = head_off_;
  }

  return out;
}

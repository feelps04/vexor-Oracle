#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

class RingBuffer {
public:
  struct Frame {
    uint64_t seq_num;
    uint64_t ts_ingest_ms;
    uint64_t ts_publish_ms;
    bool is_replay;
    std::string key;
    std::string payload;
  };

  explicit RingBuffer(size_t capacityBytes);

  size_t capacity_bytes() const { return capacity_bytes_; }
  size_t used_bytes() const { return used_bytes_; }
  double saturation_level() const;

  size_t push_drop_oldest(Frame frame);

  uint64_t last_drop_jitter_ms() const { return last_drop_jitter_ms_; }

  std::optional<Frame> pop();

  size_t size_frames() const { return size_frames_; }

private:
  struct Header {
    uint64_t seq_num;
    uint64_t ts_ingest_ms;
    uint64_t ts_publish_ms;
    uint32_t key_len;
    uint32_t payload_len;
    uint8_t flags;
    uint8_t reserved[7];
  };

  static constexpr uint8_t kFlagReplay = 0x01;

  size_t align8(size_t n) const;
  size_t frame_bytes(const Frame& f) const;
  size_t header_and_data_bytes(uint32_t keyLen, uint32_t payloadLen) const;

  bool read_header_at(size_t offset, Header& out) const;
  void write_frame_at(size_t offset, const Frame& frame);
  std::optional<size_t> next_frame_offset(size_t offset) const;

  size_t capacity_bytes_;
  size_t used_bytes_ = 0;
  size_t size_frames_ = 0;

  std::vector<uint8_t> buf_;
  size_t head_off_ = 0;
  size_t tail_off_ = 0;
  bool empty_ = true;

  uint64_t last_drop_jitter_ms_ = 0;
};

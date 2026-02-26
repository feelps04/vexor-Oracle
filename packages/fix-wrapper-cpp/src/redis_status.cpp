#include "redis_status.h"

#include <hiredis/hiredis.h>

RedisStatus::RedisStatus(std::string host, uint16_t port) : host_(std::move(host)), port_(port) {
}

bool RedisStatus::set_degraded(const std::string& reason, uint32_t ttlSeconds) {
  redisContext* c = redisConnect(host_.c_str(), static_cast<int>(port_));
  if (!c || c->err) {
    if (c) redisFree(c);
    return false;
  }

  const std::string value = std::string("{\"degraded\":1,\"reason\":\"") + reason + "\"}";

  redisReply* reply = static_cast<redisReply*>(redisCommand(c, "SETEX system:status:degraded %u %s", ttlSeconds, value.c_str()));
  const bool ok = reply && reply->type == REDIS_REPLY_STATUS;
  if (reply) freeReplyObject(reply);
  redisFree(c);
  return ok;
}

bool RedisStatus::clear_degraded(uint32_t ttlSeconds) {
  redisContext* c = redisConnect(host_.c_str(), static_cast<int>(port_));
  if (!c || c->err) {
    if (c) redisFree(c);
    return false;
  }

  const std::string value = "{\"degraded\":0}";
  redisReply* reply = static_cast<redisReply*>(redisCommand(c, "SETEX system:status:degraded %u %s", ttlSeconds, value.c_str()));
  const bool ok = reply && reply->type == REDIS_REPLY_STATUS;
  if (reply) freeReplyObject(reply);
  redisFree(c);
  return ok;
}

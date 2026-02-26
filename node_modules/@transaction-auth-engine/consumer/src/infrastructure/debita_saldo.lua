-- Atomic balance check and debit. Avoids race condition between GET and DECRBY.
-- KEYS[1]: balance key (e.g. balance:acc-123)
-- ARGV[1]: amount to debit (number)
-- ARGV[2]: initial balance if key does not exist (number)
-- Returns: 1 if approved (debit applied), 0 if denied (insufficient balance)
local key = KEYS[1]
local amount = tonumber(ARGV[1])
local initial = tonumber(ARGV[2])
local balance = redis.call('get', key)
if balance == false then
  redis.call('set', key, initial)
  balance = initial
else
  balance = tonumber(balance)
end
if balance >= amount then
  redis.call('decrby', key, amount)
  return 1
else
  return 0
end

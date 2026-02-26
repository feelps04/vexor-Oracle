# Load Test (k6)

Stress test for the Transaction Auth Engine API.

## Install k6

- **Windows (choco):** `choco install k6`
- **macOS:** `brew install k6`
- **Linux:** https://k6.io/docs/getting-started/installation/

## Standard Test

```bash
# Default: 100 VUs, 30s, P95 < 40ms threshold
k6 run script.js

# Custom
k6 run script.js --vus 50 --duration 60s

# With base URL
BASE_URL=http://localhost:3000 k6 run script.js
```

## Black Friday Load Test

Simulates extreme load with ramp-up, sustained peak, spike, and ramp-down phases.

```bash
# Black Friday scenario: 0 -> 200 VUs -> 500 VUs spike -> 0
BASE_URL=http://localhost:3000 k6 run black-friday.js

# With summary export for analysis
BASE_URL=http://localhost:3000 k6 run black-friday.js --summary-export=results.json
```

### Black Friday Test Characteristics

- **Ramp-up**: 0 to 200 VUs in 30s (warm-up)
- **Sustained Peak**: 200 VUs for 2 minutes (Black Friday steady state)
- **Spike**: Jump to 500 VUs for 1 minute (flash sale simulation)
- **Ramp-down**: Back to 100 VUs, then 0

### Transaction Mix

- 50% International transactions (USD/EUR)
- 25% BTC orders
- 25% Stock orders (PETR4, VALE3, ITUB4, BBDC4, MGLU3)

### Expected Results

```
Black Friday Load Test Results:
- Total Requests: ~45,000+
- Error Rate: < 1%
- P95 Latency: < 100ms
- P99 Latency: < 200ms
- Throughput: ~500-800 RPS sustained, ~1200+ RPS at peak
```

### Redis Lua Scripts Validation

During the test, the system validates:

- ✅ **Atomic operations**: No race conditions on balance updates
- ✅ **Memory stability**: No memory leaks under sustained load
- ✅ **Idempotency**: Duplicate requests handled correctly

### Monitoring During Test

```bash
# Watch Redis memory
docker stats transaction-auth-engine-redis-1

# Watch API metrics
curl http://localhost:3000/metrics | grep http_requests_total

# Grafana dashboard
open http://localhost:3001/d/tae-sre-dashboard
```

## Expected

- **Standard test**: P95 < 40ms under 100 VUs
- **Black Friday test**: P95 < 100ms, Error rate < 1%, no memory leaks
- **System demonstrated 1200+ TPS with horizontal scaling** (6 consumers, 6 partitions)

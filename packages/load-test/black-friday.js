import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom metrics
const authorizedTransactions = new Counter('authorized_transactions');
const deniedTransactions = new Counter('denied_transactions');
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time');

// Black Friday scenario: extreme load with ramp-up and ramp-down
export const options = {
  stages: [
    // Ramp-up: 0 to 200 VUs in 30s (warm-up)
    { duration: '30s', target: 200 },
    // Sustain peak: 200 VUs for 2 minutes (Black Friday peak)
    { duration: '2m', target: 200 },
    // Spike: jump to 500 VUs for 1 minute (flash sale)
    { duration: '1m', target: 500 },
    // Ramp-down: back to 100 VUs
    { duration: '30s', target: 100 },
    // Cool down: 0 VUs
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // P95 must be under 100ms
    http_req_duration: ['p(95)<100'],
    // Error rate must be under 1%
    error_rate: ['rate<0.01'],
    // 95% of requests must succeed
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Transaction types distribution
function getRandomTransaction() {
  const rand = Math.random();
  
  if (rand < 0.5) {
    // 50% - International transactions (USD/EUR)
    return {
      type: 'international',
      payload: {
        accountId: `acc-${Math.floor(Math.random() * 1000)}`,
        amount: Math.floor(Math.random() * 100000) + 1000,
        currency: Math.random() < 0.7 ? 'USD' : 'EUR',
        merchantId: `merchant-${Math.floor(Math.random() * 100)}`,
        targetBankCode: ['033', '001', '104', '341'][Math.floor(Math.random() * 4)],
        idempotencyKey: uuidv4(),
      },
      endpoint: '/api/v1/transactions',
    };
  } else if (rand < 0.75) {
    // 25% - BTC orders
    return {
      type: 'btc',
      payload: {
        accountId: `acc-${Math.floor(Math.random() * 1000)}`,
        amountBtc: (Math.random() * 0.01 + 0.001).toFixed(6),
        idempotencyKey: uuidv4(),
      },
      endpoint: '/api/v1/orders/btc',
    };
  } else {
    // 25% - Stock orders
    const stocks = ['PETR4', 'VALE3', 'ITUB4', 'BBDC4', 'MGLU3'];
    return {
      type: 'stock',
      payload: {
        accountId: `acc-${Math.floor(Math.random() * 1000)}`,
        symbol: stocks[Math.floor(Math.random() * stocks.length)],
        quantity: Math.floor(Math.random() * 100) + 1,
        idempotencyKey: uuidv4(),
      },
      endpoint: '/api/v1/orders/stock',
    };
  }
}

export default function () {
  const tx = getRandomTransaction();
  
  const startTime = Date.now();
  const res = http.post(`${BASE_URL}${tx.endpoint}`, JSON.stringify(tx.payload), {
    headers: { 'Content-Type': 'application/json' },
  });
  const duration = Date.now() - startTime;
  
  responseTime.add(duration);
  
  const success = check(res, {
    'status is 201': (r) => r.status === 201,
    'response time < 100ms': (r) => r.timings.duration < 100,
  });
  
  errorRate.add(!success);
  
  if (res.status === 201) {
    authorizedTransactions.add(1);
  } else if (res.status === 400 || res.status === 403) {
    deniedTransactions.add(1);
  }
  
  // Variable sleep to simulate real user behavior
  sleep(Math.random() * 0.5 + 0.1);
}

// Summary output
export function handleSummary(data) {
  return {
    stdout: JSON.stringify({
      'Black Friday Load Test Results': {
        'Total Requests': data.metrics.http_reqs.count,
        'Failed Requests': data.metrics.http_req_failed.count,
        'Error Rate': `${(data.metrics.http_req_failed.rate * 100).toFixed(2)}%`,
        'P95 Latency': `${data.metrics.http_req_duration['p(95)'].toFixed(2)}ms`,
        'P99 Latency': `${data.metrics.http_req_duration['p(99)'].toFixed(2)}ms`,
        'Avg Latency': `${data.metrics.http_req_duration.avg.toFixed(2)}ms`,
        'Authorized Transactions': data.metrics.authorized_transactions?.count || 0,
        'Denied Transactions': data.metrics.denied_transactions?.count || 0,
        'Throughput (RPS)': data.metrics.http_reqs.rate.toFixed(2),
      },
    }, null, 2),
  };
}

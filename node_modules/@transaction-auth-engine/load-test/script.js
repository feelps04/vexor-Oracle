/**
 * k6 load test for POST /api/v1/transactions
 * Install k6: https://k6.io/docs/getting-started/installation/
 * Run: k6 run script.js
 * Stress (100 VUs, 30s): k6 run script.js --vus 100 --duration 30s
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 100,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<40'], // 95% of requests under 40ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function () {
  const payload = JSON.stringify({
    accountId: `acc_${Math.floor(Math.random() * 100)}`,
    amount: Math.floor(Math.random() * 50000) + 100,
    currency: 'BRL',
    merchantId: `merchant_${Math.floor(Math.random() * 10)}`,
    idempotencyKey: randomId(),
  });

  const res = http.post(`${BASE_URL}/api/v1/transactions`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, { 'status is 201': (r) => r.status === 201 });
  if (res.status !== 201) {
    console.warn(`Unexpected status ${res.status}: ${res.body}`);
  }

  sleep(0.1);
}

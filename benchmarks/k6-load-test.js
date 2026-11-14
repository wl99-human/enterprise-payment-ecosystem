import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Metrics
const settlementLatencyTrend = new Trend('settlement_latency_ms');
const duplicateRejections = new Counter('idempotency_duplicate_hits');
const successfulSettlements = new Counter('successful_settlements');
const rateLimitRejections = new Counter('rate_limit_429_hits');

export const options = {
  scenarios: {
    // High-concurrency transaction spike across 100 hot accounts with 30% duplicate keys
    hot_account_spike: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: 200 },
        { duration: '1m', target: 1000 },
        { duration: '30s', target: 1000 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // FAANG SLA: p95 latency must be under 80ms for fast-path ingestion
    'settlement_latency_ms': ['p(95)<80', 'p(99)<150'],
    'http_req_failed': ['rate<0.05'], // Max 5% unexpected failures
  },
};

const HOT_ACCOUNTS = Array.from({ length: 100 }, (_, i) => `acc_hot_${String(i).padStart(3, '0')}`);
const REUSABLE_IDEMPOTENCY_KEYS = Array.from({ length: 100 }, (_, i) => `dup_key_pool_${i}`);

export default function () {
  const senderIndex = Math.floor(Math.random() * 50);
  const receiverIndex = 50 + Math.floor(Math.random() * 50);
  const senderId = HOT_ACCOUNTS[senderIndex];
  const receiverId = HOT_ACCOUNTS[receiverIndex];

  // 30% probability of injecting duplicate key to test Bloom filter & Redis mutex
  const isDuplicate = Math.random() < 0.30;
  const idempotencyKey = isDuplicate
    ? REUSABLE_IDEMPOTENCY_KEYS[Math.floor(Math.random() * REUSABLE_IDEMPOTENCY_KEYS.length)]
    : `idem_${__VU}_${__ITER}_${Date.now()}`;

  const payload = JSON.stringify({
    senderAccountId: senderId,
    receiverAccountId: receiverId,
    amountMinorUnits: Math.floor(100 + Math.random() * 4900), // $1.00 - $50.00
    currency: 'USD',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
      'X-Signature': 'mock_hmac_verified_sha256',
    },
  };

  const startTime = Date.now();
  const res = http.post('http://localhost:8080/api/v1/payments/transfer', payload, params);
  const duration = Date.now() - startTime;

  settlementLatencyTrend.add(duration);

  if (res.status === 200 || res.status === 202) {
    successfulSettlements.add(1);
    check(res, {
      'transfer accepted': (r) => r.status === 200 || r.status === 202,
      'has transactionId': (r) => JSON.parse(r.body).transactionId !== undefined,
    });
  } else if (res.status === 409) {
    duplicateRejections.add(1);
    check(res, {
      'idempotency conflict caught': (r) => r.status === 409,
    });
  } else if (res.status === 429) {
    rateLimitRejections.add(1);
    check(res, {
      'rate limit triggered': (r) => r.status === 429,
    });
  }

  sleep(0.05); // 50ms pacing between requests
}

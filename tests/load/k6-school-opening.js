import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const enablePayments = __ENV.ENABLE_PAYMENTS === 'true';
const enableCashClose = __ENV.ENABLE_CASH_CLOSE === 'true';
const scenarios = {
  school_opening: { executor: 'constant-vus', vus: 50, duration: '30m' },
};

if (enablePayments) {
  scenarios.payments = {
    executor: 'constant-arrival-rate',
    rate: 200,
    timeUnit: '1h',
    duration: '30m',
    preAllocatedVUs: 10,
    maxVUs: 50,
    exec: 'payment',
  };
}

if (enableCashClose) {
  scenarios.cash_closing = {
    executor: 'shared-iterations',
    vus: 1,
    iterations: 1,
    startTime: '31m',
    exec: 'closeCashSession',
  };
}

export const options = {
  scenarios,
  thresholds: {
    'http_req_failed{scenario:school_opening}': ['rate<0.01'],
    'http_req_duration{scenario:school_opening}': ['p(95)<750'],
    ...(enablePayments
      ? {
          'http_req_failed{scenario:payments}': ['rate<0.01'],
          'http_req_duration{scenario:payments}': ['p(95)<1000'],
        }
      : {}),
    ...(enableCashClose
      ? {
          'checks{scenario:cash_closing}': ['rate==1'],
          'http_req_duration{scenario:cash_closing}': ['p(95)<1500'],
        }
      : {}),
  },
};

const base = __ENV.API_URL;
const accessToken = __ENV.ACCESS_TOKEN;
const enrollmentId = __ENV.ENROLLMENT_ID;
const paymentAmount = Number(__ENV.PAYMENT_AMOUNT || 1000);
const scopeHeaders = __ENV.SCOPE_UNIT_IDS ? { 'X-Scope-Unit-Ids': __ENV.SCOPE_UNIT_IDS } : {};
const headers = {
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  ...scopeHeaders,
};

export function setup() {
  if (!base || !accessToken) {
    fail('API_URL et ACCESS_TOKEN sont obligatoires.');
  }
  if (enablePayments && (!enrollmentId || !Number.isInteger(paymentAmount) || paymentAmount < 1)) {
    fail('ENROLLMENT_ID et un PAYMENT_AMOUNT entier positif sont obligatoires pour les paiements.');
  }

  const readiness = http.get(`${base}/health/ready`);
  if (!check(readiness, { 'API prête avant la charge': (response) => response.status === 200 })) {
    fail(`API indisponible avant le test (HTTP ${readiness.status}).`);
  }

  let cashSessionId = null;
  if (enablePayments || enableCashClose) {
    const currentSession = http.get(`${base}/cash-sessions/current`, { headers });
    const session = currentSession.status === 200 ? currentSession.json() : null;
    cashSessionId = session && typeof session.id === 'string' ? session.id : null;
    if (!cashSessionId) {
      fail('Le compte de charge doit posséder une session de caisse dédiée et ouverte.');
    }
  }

  return { cashSessionId };
}

export default function () {
  check(http.get(`${base}/reports/accountant-dashboard`, { headers }), {
    'dashboard 200': (response) => response.status === 200,
  });
  sleep(0.5);
}

export function payment() {
  const body = JSON.stringify({
    enrollmentId,
    amount: paymentAmount,
    paymentMethod: 'CASH',
    confirmOverpayment: false,
  });
  const response = http.post(`${base}/payments/cash`, body, {
    headers: { ...headers, 'Idempotency-Key': `k6-${__VU}-${__ITER}` },
  });
  check(response, { 'paiement créé': (result) => result.status === 201 });
}

export function closeCashSession(data) {
  if (!enableCashClose || !data?.cashSessionId) fail('Session de caisse de charge absente.');
  const body = JSON.stringify({
    declaredAmounts: {
      CASH: 0,
      BANK_TRANSFER: 0,
      BANK_DEPOSIT: 0,
      CHEQUE: 0,
      OTHER: 0,
    },
    varianceReason: 'Clôture contrôlée du test de charge CSB-11.8 en préproduction',
  });
  const response = http.post(`${base}/cash-sessions/${data.cashSessionId}/close`, body, {
    headers,
  });
  check(response, {
    'session clôturée': (result) => result.status === 200,
    'statut CLOSED': (result) => result.status === 200 && result.json('status') === 'CLOSED',
  });
}

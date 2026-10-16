import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    rentree: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 30 },
        { duration: '3m', target: 30 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800'] },
};

const baseUrl = __ENV.API_BASE_URL || 'http://localhost:3000';
export default function () {
  const response = http.get(`${baseUrl}/health/ready`);
  check(response, { 'API prête': (value) => value.status === 200 });
  sleep(1);
}

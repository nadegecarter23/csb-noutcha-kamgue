import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  InitiateProviderPayment,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderTransaction,
  ProviderWebhook,
} from './payment-provider.js';

export class FakePaymentProvider implements PaymentProvider {
  readonly code = 'FAKE' as const;
  private readonly payments = new Map<string, ProviderPaymentResult & { paymentId: string }>();
  constructor(private readonly secret: string) {}
  async initiate(input: InitiateProviderPayment) {
    if (input.payerPhone.endsWith('002')) throw new Error('PROVIDER_UNAVAILABLE');
    const providerReference = `FAKE-${randomUUID()}`;
    const failed = input.payerPhone.endsWith('000') || input.payerPhone.endsWith('001');
    const result: ProviderPaymentResult & { paymentId: string } = failed
      ? {
          providerReference,
          status: 'FAILED',
          amount: input.amount,
          reason: input.payerPhone.endsWith('000') ? 'INSUFFICIENT_FUNDS' : 'REJECTED_BY_USER',
          confirmedNoDebit: true,
          paymentId: input.paymentId,
        }
      : { providerReference, status: 'PENDING', amount: input.amount, paymentId: input.paymentId };
    this.payments.set(providerReference, result);
    return result;
  }
  async getStatus(providerReference: string) {
    return (
      this.payments.get(providerReference) ?? { providerReference, status: 'UNKNOWN' as const }
    );
  }
  settle(providerReference: string, status: 'SUCCESS' | 'FAILED', amount?: number) {
    const current = this.payments.get(providerReference);
    if (!current) throw new Error('Paiement factice inconnu.');
    this.payments.set(providerReference, {
      ...current,
      status,
      ...(amount !== undefined ? { amount } : {}),
      ...(status === 'FAILED' ? { confirmedNoDebit: true, reason: 'REJECTED_BY_USER' } : {}),
    });
  }
  sign(rawBody: string) {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>) {
    const actual = headers['x-cplan-signature'] ?? '';
    const expected = this.sign(rawBody);
    return (
      actual.length === expected.length &&
      timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    );
  }
  parseWebhook(rawBody: string): ProviderWebhook {
    const body = JSON.parse(rawBody) as ProviderWebhook;
    if (!body.eventId || !body.status) throw new Error('Webhook factice invalide.');
    return body;
  }
  async listTransactions(_from: Date, _to: Date): Promise<ProviderTransaction[]> {
    return [...this.payments.values()].map((p) => ({
      providerReference: p.providerReference,
      paymentId: p.paymentId,
      amount: p.amount ?? 0,
      status: p.status,
    }));
  }
}

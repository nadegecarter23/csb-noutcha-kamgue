import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  InitiateProviderPayment,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderWebhook,
} from './payment-provider.js';

type OrangeConfig = {
  baseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  merchantKey: string;
  webhookSecret: string;
};
export class OrangeMoneyProvider implements PaymentProvider {
  readonly code = 'ORANGE_MONEY' as const;
  constructor(private readonly config: OrangeConfig) {}
  private async token() {
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok) throw new Error(`ORANGE_TOKEN_${response.status}`);
    return ((await response.json()) as { access_token: string }).access_token;
  }
  async initiate(input: InitiateProviderPayment): Promise<ProviderPaymentResult> {
    const token = await this.token();
    const response = await fetch(`${this.config.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        merchant_key: this.config.merchantKey,
        order_id: input.paymentId,
        amount: input.amount,
        currency: input.currency,
        payer_msisdn: input.payerPhone,
        notif_url: input.callbackUrl,
        return_url: input.callbackUrl,
        cancel_url: input.callbackUrl,
        reference: input.reference,
      }),
    });
    if (!response.ok) throw new Error(`ORANGE_PAYMENT_${response.status}`);
    const body = (await response.json()) as {
      pay_token?: string;
      payment_url?: string;
      status?: string;
    };
    return {
      providerReference: body.pay_token ?? input.paymentId,
      financialId: body.payment_url,
      status: body.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING',
      amount: input.amount,
    };
  }
  async getStatus(providerReference: string): Promise<ProviderPaymentResult> {
    const token = await this.token();
    const response = await fetch(`${this.config.baseUrl}/payments/${providerReference}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) return { providerReference, status: 'UNKNOWN' };
    const body = (await response.json()) as {
      status?: string;
      amount?: number;
      txnid?: string;
      message?: string;
    };
    const status =
      body.status === 'SUCCESS'
        ? 'SUCCESS'
        : ['FAILED', 'CANCELLED', 'EXPIRED'].includes(body.status ?? '')
          ? 'FAILED'
          : body.status === 'PENDING'
            ? 'PENDING'
            : 'UNKNOWN';
    return {
      providerReference,
      status,
      amount: body.amount,
      financialId: body.txnid,
      reason: body.message,
      confirmedNoDebit: status === 'FAILED',
    };
  }
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>) {
    const signature = headers['x-cplan-signature'] ?? '';
    const expected = createHmac('sha256', this.config.webhookSecret).update(rawBody).digest('hex');
    return (
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    );
  }
  parseWebhook(rawBody: string): ProviderWebhook {
    const body = JSON.parse(rawBody) as {
      event_id?: string;
      order_id?: string;
      pay_token?: string;
      status?: string;
      amount?: number;
      message?: string;
    };
    return {
      eventId: body.event_id ?? randomUUID(),
      paymentId: body.order_id,
      providerReference: body.pay_token,
      status:
        body.status === 'SUCCESS'
          ? 'SUCCESS'
          : ['FAILED', 'CANCELLED', 'EXPIRED'].includes(body.status ?? '')
            ? 'FAILED'
            : 'PENDING',
      amount: body.amount,
      reason: body.message,
      confirmedNoDebit: ['FAILED', 'CANCELLED', 'EXPIRED'].includes(body.status ?? ''),
    };
  }
}

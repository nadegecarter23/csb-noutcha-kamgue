import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  InitiateProviderPayment,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderWebhook,
} from './payment-provider.js';

type MtnConfig = {
  baseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  targetEnvironment: string;
  webhookSecret: string;
};
export class MtnMomoProvider implements PaymentProvider {
  readonly code = 'MTN_MOMO' as const;
  constructor(private readonly config: MtnConfig) {}
  private async token() {
    const auth = Buffer.from(`${this.config.apiUser}:${this.config.apiKey}`).toString('base64');
    const response = await fetch(`${this.config.baseUrl}/collection/token/`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
      },
    });
    if (!response.ok) throw new Error(`MTN_TOKEN_${response.status}`);
    return ((await response.json()) as { access_token: string }).access_token;
  }
  async initiate(input: InitiateProviderPayment): Promise<ProviderPaymentResult> {
    const id = randomUUID();
    const token = await this.token();
    const response = await fetch(`${this.config.baseUrl}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
        'X-Reference-Id': id,
        'X-Target-Environment': this.config.targetEnvironment,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(input.amount),
        currency: input.currency,
        externalId: input.paymentId,
        payer: { partyIdType: 'MSISDN', partyId: input.payerPhone.replace(/^\+/, '') },
        payerMessage: `Frais scolaires ${input.reference}`,
        payeeNote: input.reference,
      }),
    });
    if (!response.ok) throw new Error(`MTN_REQUEST_TO_PAY_${response.status}`);
    return { providerReference: id, status: 'PENDING', amount: input.amount };
  }
  async getStatus(providerReference: string): Promise<ProviderPaymentResult> {
    const token = await this.token();
    const response = await fetch(
      `${this.config.baseUrl}/collection/v1_0/requesttopay/${providerReference}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
          'X-Target-Environment': this.config.targetEnvironment,
        },
      },
    );
    if (!response.ok) return { providerReference, status: 'UNKNOWN' };
    const body = (await response.json()) as {
      status?: string;
      amount?: string;
      financialTransactionId?: string;
      reason?: string;
    };
    const status =
      body.status === 'SUCCESSFUL'
        ? 'SUCCESS'
        : body.status === 'FAILED'
          ? 'FAILED'
          : body.status === 'PENDING'
            ? 'PENDING'
            : 'UNKNOWN';
    return {
      providerReference,
      status,
      amount: body.amount ? Number(body.amount) : undefined,
      financialId: body.financialTransactionId,
      reason: body.reason,
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
      eventId?: string;
      externalId?: string;
      referenceId?: string;
      status?: string;
      amount?: string;
      reason?: string;
    };
    return {
      eventId: body.eventId ?? body.referenceId ?? randomUUID(),
      paymentId: body.externalId,
      providerReference: body.referenceId,
      status:
        body.status === 'SUCCESSFUL' ? 'SUCCESS' : body.status === 'FAILED' ? 'FAILED' : 'PENDING',
      amount: body.amount ? Number(body.amount) : undefined,
      reason: body.reason,
      confirmedNoDebit: body.status === 'FAILED',
    };
  }
}

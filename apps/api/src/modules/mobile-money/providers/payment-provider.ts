export type ProviderPaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN';
export interface ProviderPaymentResult {
  status: ProviderPaymentStatus;
  providerReference: string;
  financialId?: string | undefined;
  amount?: number | undefined;
  reason?: string | undefined;
  confirmedNoDebit?: boolean | undefined;
}
export interface InitiateProviderPayment {
  paymentId: string;
  reference: string;
  amount: number;
  currency: 'XAF';
  payerPhone: string;
  callbackUrl: string;
}
export interface ProviderWebhook {
  eventId: string;
  paymentId?: string | undefined;
  providerReference?: string | undefined;
  status: ProviderPaymentStatus;
  amount?: number | undefined;
  reason?: string | undefined;
  confirmedNoDebit?: boolean | undefined;
}
export interface ProviderTransaction {
  providerReference: string;
  paymentId?: string | undefined;
  amount: number;
  status: ProviderPaymentStatus;
}
export interface PaymentProvider {
  readonly code: 'MTN_MOMO' | 'ORANGE_MONEY' | 'FAKE';
  initiate(input: InitiateProviderPayment): Promise<ProviderPaymentResult>;
  getStatus(providerReference: string): Promise<ProviderPaymentResult>;
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean;
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): ProviderWebhook;
  listTransactions?(from: Date, to: Date): Promise<ProviderTransaction[]>;
}

import type { AppConfig } from '../../../platform/config.js';
import type { MobileMoneyProviderCode } from '@cplan/contracts';
import type { PaymentProvider } from './payment-provider.js';
import { FakePaymentProvider } from './fake.provider.js';
import { MtnMomoProvider } from './mtn.provider.js';
import { OrangeMoneyProvider } from './orange.provider.js';

export function createPaymentProviderRegistry(config: AppConfig) {
  const fake = new FakePaymentProvider(config.FAKE_PAYMENT_WEBHOOK_SECRET);
  const providers = new Map<MobileMoneyProviderCode, PaymentProvider>([['FAKE', fake]]);
  if (
    config.PAYMENT_PROVIDER_MODE === 'live' &&
    config.MTN_MOMO_BASE_URL &&
    config.MTN_MOMO_SUBSCRIPTION_KEY &&
    config.MTN_MOMO_API_USER &&
    config.MTN_MOMO_API_KEY
  )
    providers.set(
      'MTN_MOMO',
      new MtnMomoProvider({
        baseUrl: config.MTN_MOMO_BASE_URL,
        subscriptionKey: config.MTN_MOMO_SUBSCRIPTION_KEY,
        apiUser: config.MTN_MOMO_API_USER,
        apiKey: config.MTN_MOMO_API_KEY,
        targetEnvironment: config.MTN_MOMO_TARGET_ENVIRONMENT,
        webhookSecret: config.MTN_MOMO_API_KEY,
      }),
    );
  else providers.set('MTN_MOMO', fake);
  if (
    config.PAYMENT_PROVIDER_MODE === 'live' &&
    config.ORANGE_MONEY_BASE_URL &&
    config.ORANGE_MONEY_CLIENT_ID &&
    config.ORANGE_MONEY_CLIENT_SECRET &&
    config.ORANGE_MONEY_MERCHANT_KEY
  )
    providers.set(
      'ORANGE_MONEY',
      new OrangeMoneyProvider({
        baseUrl: config.ORANGE_MONEY_BASE_URL,
        tokenUrl: config.ORANGE_MONEY_TOKEN_URL,
        clientId: config.ORANGE_MONEY_CLIENT_ID,
        clientSecret: config.ORANGE_MONEY_CLIENT_SECRET,
        merchantKey: config.ORANGE_MONEY_MERCHANT_KEY,
        webhookSecret: config.ORANGE_MONEY_CLIENT_SECRET,
      }),
    );
  else providers.set('ORANGE_MONEY', fake);
  return {
    get(code: MobileMoneyProviderCode) {
      const provider = providers.get(code);
      if (!provider) throw new Error(`Fournisseur ${code} indisponible.`);
      return provider;
    },
    entries() {
      return [...providers.entries()];
    },
    fake,
  };
}
export type PaymentProviderRegistry = ReturnType<typeof createPaymentProviderRegistry>;

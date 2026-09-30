import { PaymentGatewayProviderType } from '@prisma/client';
import { PaymentGatewayProvider } from './types';
import { BkashPaymentProvider } from './bkash.provider';
import { SSLCommerzPaymentProvider } from './sslcommerz.provider';

export * from './types';
export * from './bkash.provider';
export * from './sslcommerz.provider';

const providers: Record<PaymentGatewayProviderType, PaymentGatewayProvider> = {
  [PaymentGatewayProviderType.BKASH]: new BkashPaymentProvider(),
  [PaymentGatewayProviderType.SSLCOMMERZ]: new SSLCommerzPaymentProvider(),
};

export function getPaymentProvider(type: PaymentGatewayProviderType): PaymentGatewayProvider {
  const provider = providers[type];
  if (!provider) {
    throw new Error(`UNKNOWN_PAYMENT_GATEWAY_PROVIDER: ${type}`);
  }
  return provider;
}

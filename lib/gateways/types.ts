import { PaymentGatewayProviderType } from '@prisma/client';

export interface BkashCredentials {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
}

export interface SSLCommerzCredentials {
  storeId: string;
  storePassword: string;
}

export type GatewayCredentials = BkashCredentials | SSLCommerzCredentials;

export interface GatewayInitiateParams {
  merchantTransactionId: string;
  amount: number;
  currency: string;
  invoiceId: string;
  invoiceNumber: string;
  studentId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  callbackUrl: string;
  ipnUrl?: string;
  isSandbox: boolean;
  credentials: Record<string, string | undefined>;
}

export interface GatewayInitiateResult {
  success: boolean;
  gatewayUrl?: string;
  providerPaymentId?: string; // e.g. bKash paymentID
  sessionKey?: string; // e.g. SSLCommerz sessionkey
  errorMessage?: string;
  rawResponse?: Record<string, unknown>;
}

export interface GatewayVerifyParams {
  merchantTransactionId: string;
  providerTransactionId?: string; // e.g. bKash paymentID, SSLCommerz val_id
  amount: number;
  currency: string;
  credentials: Record<string, string | undefined>;
  isSandbox: boolean;
  rawParams?: Record<string, string | undefined>;
}

export interface GatewayVerifyResult {
  isSuccessful: boolean;
  amount: number;
  currency: string;
  providerTransactionId: string; // The official unique transaction ID (e.g. bKash trxID, SSLCommerz bank_tran_id / tran_id)
  providerPaymentId?: string; // e.g. bKash paymentID, SSLCommerz val_id
  statusMessage?: string;
  failureReason?: string;
  rawMetadata?: Record<string, unknown>;
}

export interface GatewayTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaymentGatewayProvider {
  readonly providerType: PaymentGatewayProviderType;
  initiatePayment(params: GatewayInitiateParams): Promise<GatewayInitiateResult>;
  verifyPayment(params: GatewayVerifyParams): Promise<GatewayVerifyResult>;
  testConnection(credentials: Record<string, string | undefined>, isSandbox: boolean): Promise<GatewayTestResult>;
}

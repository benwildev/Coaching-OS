import type { CommunicationChannel } from '@prisma/client';

export interface CommunicationMessage {
  to: string; // phone number or email address, depending on the channel
  subject?: string; // used by EMAIL only
  body: string;
  // EMAIL only: pre-escaped HTML rendering of `body` (see interpolateHtml in
  // template-interpolation.ts). Built by the caller, which has the template
  // variables needed to escape only the variable *values*, not the trusted
  // template text — the provider never re-derives HTML from raw `body`.
  htmlBody?: string;
}

export interface CommunicationResult {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  providerMessageId?: string | null;
  provider?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  // Whether a FAILED result is worth retrying (temporary provider/network
  // error) vs a permanent one (invalid recipient, rejected credentials,
  // rejected template). Null when not applicable, e.g. SKIPPED never got a
  // provider verdict to classify.
  retryable?: boolean | null;
}

export interface ProviderHealthCheckResult {
  ok: boolean;
  message: string;
}

export interface ProviderBalanceResult {
  ok: boolean;
  balance?: string | number | null;
  currency?: string | null;
  validity?: string | null;
  message?: string;
}

export interface SmsRecipientReport {
  number: string;
  charge: string | number;
  status: string;
}

export interface ProviderReportResult {
  ok: boolean;
  requestId?: string | number | null;
  requestStatus?: string | null;
  requestCharge?: string | number | null;
  recipients?: SmsRecipientReport[];
  message?: string;
  raw?: unknown;
}

/**
 * Resolved, plaintext, per-tenant credentials for one channel — built by
 * `resolveProviderCredentials()` (communication-settings.service.ts), which
 * decrypts the tenant's saved CommunicationProviderConfig row when one
 * exists. Field names are channel-specific (SMS: apiKey/senderId/baseUrl;
 * WhatsApp: token/phoneNumberId/appSecret/apiVersion; Email:
 * smtpHost/smtpPort/smtpUser/smtpPass/fromName) and are simply absent when
 * not configured — every provider falls back to its own server-side env var
 * for any key that's missing here, so a tenant that never opens the
 * settings page keeps working exactly as it did before this existed.
 */
export type ProviderCredentials = Record<string, string | undefined>;

export interface CommunicationProvider {
  readonly channel: CommunicationChannel;
  send(message: CommunicationMessage, credentials?: ProviderCredentials): Promise<CommunicationResult>;
  /** True when this channel is usable for the given tenant (its saved credentials, or the env var fallback). Never exposes values. */
  isConfigured(credentials?: ProviderCredentials): boolean;
  /** A safe, read-only connectivity check — must never send a real message. */
  testConnection(credentials?: ProviderCredentials): Promise<ProviderHealthCheckResult>;
  /** Optional read-only balance/recharge check for providers that support prepaid balances (e.g. SMS). */
  getBalance?(credentials?: ProviderCredentials): Promise<ProviderBalanceResult>;
  /** Optional delivery report query by request ID (e.g. SMS gateway reports). */
  getDeliveryReport?(requestId: string, credentials?: ProviderCredentials): Promise<ProviderReportResult>;
}

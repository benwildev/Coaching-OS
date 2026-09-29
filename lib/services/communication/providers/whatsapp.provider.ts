import type { CommunicationMessage, CommunicationProvider, CommunicationResult, ProviderCredentials, ProviderHealthCheckResult } from './types';
import { normalizeBangladeshPhone } from '@/lib/utils/phone';
import { getMockResult, isMockModeEnabled } from './mock';

// WhatsApp Cloud API (Graph API) error codes that are transient/rate-limit
// in nature; everything else (auth, permission, invalid recipient, rejected
// template) is treated as permanent.
const RETRYABLE_ERROR_CODES = new Set([1, 2, 4, 80007, 130429, 131048, 131056]);

interface GraphSendResponse {
  messages?: { id: string }[];
  error?: { message?: string; code?: number; error_subcode?: number };
}

interface GraphHealthResponse {
  verified_name?: string;
  error?: { message?: string };
}

/**
 * WhatsApp provider adapter for the official WhatsApp Business Cloud API
 * (Meta Graph API). Per AGENTS.md §24 this must only ever call the official
 * API — never browser automation over a personal WhatsApp session.
 *
 * Limitation (documented, not silently worked around): business-initiated
 * messages sent outside an open 24-hour customer-service session generally
 * require a pre-approved message *template*, not free text. This adapter
 * sends plain text messages, which work within an open session/sandbox;
 * template-message support is deferred (see docs/communication.md).
 *
 * Credentials resolve tenant-saved value first, then the server-side env var
 * fallback — see ProviderCredentials in ./types.
 */
export class WhatsAppProvider implements CommunicationProvider {
  readonly channel = 'WHATSAPP' as const;

  private token(c?: ProviderCredentials): string | undefined {
    return c?.token || process.env.WHATSAPP_BUSINESS_API_TOKEN;
  }

  private phoneNumberId(c?: ProviderCredentials): string | undefined {
    return c?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  }

  private apiVersion(c?: ProviderCredentials): string {
    return c?.apiVersion || process.env.WHATSAPP_API_VERSION || 'v20.0';
  }

  isConfigured(c?: ProviderCredentials): boolean {
    return Boolean(this.token(c) && this.phoneNumberId(c));
  }

  async send(message: CommunicationMessage, credentials?: ProviderCredentials): Promise<CommunicationResult> {
    if (isMockModeEnabled()) return getMockResult(this.channel, message);

    if (!this.isConfigured(credentials)) {
      return { status: 'SKIPPED', provider: 'whatsapp', errorMessage: 'PROVIDER_NOT_CONFIGURED', retryable: null };
    }

    const phone = normalizeBangladeshPhone(message.to);
    if (!phone.valid) {
      return { status: 'FAILED', provider: 'whatsapp', errorCode: 'INVALID_PHONE', errorMessage: phone.reason, retryable: false };
    }

    try {
      const res = await fetch(`https://graph.facebook.com/${this.apiVersion(credentials)}/${this.phoneNumberId(credentials)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token(credentials)}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.msisdn880,
          type: 'text',
          text: { body: message.body },
        }),
      });

      const data = (await res.json()) as GraphSendResponse;

      if (res.ok && data.messages?.[0]?.id) {
        return { status: 'SENT', provider: 'whatsapp', providerMessageId: data.messages[0].id };
      }

      const code = data.error?.code;
      return {
        status: 'FAILED',
        provider: 'whatsapp',
        errorCode: code != null ? String(code) : `HTTP_${res.status}`,
        errorMessage: data.error?.message || 'WhatsApp API rejected the message',
        retryable: res.status >= 500 || (code != null && RETRYABLE_ERROR_CODES.has(code)),
      };
    } catch (error) {
      return {
        status: 'FAILED',
        provider: 'whatsapp',
        errorCode: 'NETWORK_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Network error contacting WhatsApp API',
        retryable: true,
      };
    }
  }

  async testConnection(credentials?: ProviderCredentials): Promise<ProviderHealthCheckResult> {
    if (!this.isConfigured(credentials)) {
      return { ok: false, message: 'Provider is not configured.' };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/${this.apiVersion(credentials)}/${this.phoneNumberId(credentials)}?fields=verified_name`, {
        headers: { Authorization: `Bearer ${this.token(credentials)}` },
      });
      const data = (await res.json()) as GraphHealthResponse;
      if (res.ok && !data.error) return { ok: true, message: `Connected (verified name: ${data.verified_name || 'unknown'}).` };
      return { ok: false, message: data.error?.message || `Gateway returned HTTP ${res.status}.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Connection check failed.' };
    }
  }
}

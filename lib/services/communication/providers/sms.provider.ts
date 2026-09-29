import type {
  CommunicationMessage,
  CommunicationProvider,
  CommunicationResult,
  ProviderCredentials,
  ProviderHealthCheckResult,
  ProviderBalanceResult,
  ProviderReportResult,
} from './types';
import { normalizeBangladeshPhone } from '@/lib/utils/phone';
import { getMockResult, isMockModeEnabled } from './mock';

export const SMS_ERROR_MESSAGES: Record<number, string> = {
  0: 'Success',
  400: 'Missing or invalid parameter (Error 400)',
  403: 'Permission denied to perform request (Error 403)',
  404: 'Request or resource not found (Error 404)',
  405: 'Authorization required: Verify your API Key (Error 405)',
  409: 'Server error on SMS gateway (Error 409)',
  410: 'Account expired (Error 410)',
  411: 'Reseller account expired or suspended (Error 411)',
  412: 'Invalid schedule date/time (Error 412)',
  413: 'Invalid Sender ID (Error 413)',
  414: 'Message is empty (Error 414)',
  415: 'Message is too long (Error 415)',
  416: 'No valid phone number found (Error 416)',
  417: 'Insufficient SMS balance (Error 417)',
  420: 'Message content blocked (Error 420)',
  421: 'Trial limitation: You can only send to your registered phone number until your first recharge (Error 421)',
};

// Non-retryable SMS.BD/Alpha-SMS-style error codes: structural/validation/
// business errors that will never succeed on their own by retrying.
const NON_RETRYABLE_ERROR_CODES = new Set([400, 403, 404, 405, 410, 411, 412, 413, 414, 415, 416, 417, 420, 421]);

interface SmsSendResponse {
  error: number;
  msg?: string;
  data?: { request_id?: number | string };
}

interface SmsReportResponse {
  error: number;
  msg?: string;
  data?: {
    request_id?: number | string;
    request_status?: string;
    request_charge?: string | number;
    recipients?: Array<{
      number: string;
      charge: string | number;
      status: string;
    }>;
  };
}

interface SmsBalanceResponse {
  error: number;
  msg?: string;
  data?: { balance?: number | string; validity?: string };
  response?: string | number;
  balance?: string | number;
  validity?: string;
}

/**
 * SMS provider adapter for SMS.BD (https://sms.bd/), whose documented API
 * contract matches the Alpha-SMS-style gateway at api.sms.net.bd. NOTE: this
 * contract was taken from SMS.BD's public API docs, not verified against a
 * live account — confirm the exact endpoint/params against the user's own
 * SMS.BD dashboard before the first real production send (see
 * docs/communication.md).
 *
 * Credentials resolve tenant-saved value first, then the server-side env var
 * fallback — see ProviderCredentials in ./types.
 */
export class SmsProvider implements CommunicationProvider {
  readonly channel = 'SMS' as const;

  private apiKey(c?: ProviderCredentials): string | undefined {
    return c?.apiKey || process.env.SMS_PROVIDER_API_KEY;
  }

  private senderId(c?: ProviderCredentials): string | undefined {
    return c?.senderId || process.env.SMS_SENDER_ID;
  }

  private baseUrl(c?: ProviderCredentials): string {
    let raw = (c?.baseUrl || process.env.SMS_PROVIDER_BASE_URL || 'https://api.sms.net.bd').trim();
    if (raw && !raw.startsWith('http://') && !raw.startsWith('https://')) {
      raw = `https://${raw}`;
    }
    // Remove trailing slashes and common appended endpoint paths like /sendsms or /user/balance
    raw = raw.replace(/\/+$/, '');
    raw = raw.replace(/\/(sendsms|user\/balance|balance).*$/i, '');
    return raw || 'https://api.sms.net.bd';
  }

  isConfigured(c?: ProviderCredentials): boolean {
    return Boolean(this.apiKey(c));
  }

  async send(message: CommunicationMessage, credentials?: ProviderCredentials): Promise<CommunicationResult> {
    if (isMockModeEnabled()) return getMockResult(this.channel, message);

    if (!this.isConfigured(credentials)) {
      return { status: 'SKIPPED', provider: 'sms', errorMessage: 'PROVIDER_NOT_CONFIGURED', retryable: null };
    }

    const phone = normalizeBangladeshPhone(message.to);
    if (!phone.valid) {
      return { status: 'FAILED', provider: 'sms', errorCode: 'INVALID_PHONE', errorMessage: phone.reason, retryable: false };
    }

    try {
      const payload: Record<string, string> = {
        api_key: this.apiKey(credentials)!,
        msg: message.body,
        to: phone.msisdn880,
      };
      const senderId = this.senderId(credentials);
      if (senderId && senderId.trim()) {
        payload.sender_id = senderId.trim();
      }

      const res = await fetch(`${this.baseUrl(credentials)}/sendsms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // 5xx / gateway-level failures are transient; treat as retryable.
        return {
          status: 'FAILED',
          provider: 'sms',
          errorCode: `HTTP_${res.status}`,
          errorMessage: 'SMS gateway returned a non-2xx response',
          retryable: res.status >= 500,
        };
      }

      const data = (await res.json()) as SmsSendResponse;
      if (data.error === 0) {
        return { status: 'SENT', provider: 'sms', providerMessageId: data.data?.request_id != null ? String(data.data.request_id) : null };
      }

      return {
        status: 'FAILED',
        provider: 'sms',
        errorCode: String(data.error),
        errorMessage: data.msg || 'SMS gateway rejected the message',
        retryable: !NON_RETRYABLE_ERROR_CODES.has(data.error),
      };
    } catch (error) {
      return {
        status: 'FAILED',
        provider: 'sms',
        errorCode: 'NETWORK_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Network error contacting SMS gateway',
        retryable: true,
      };
    }
  }

  async getBalance(credentials?: ProviderCredentials): Promise<ProviderBalanceResult> {
    if (isMockModeEnabled()) {
      return { ok: true, balance: '500.00', currency: 'BDT', message: 'Connected successfully (Mock mode)' };
    }

    if (!this.isConfigured(credentials)) {
      return { ok: false, message: 'Provider is not configured.' };
    }

    try {
      const res = await fetch(`${this.baseUrl(credentials)}/user/balance/?api_key=${encodeURIComponent(this.apiKey(credentials)!)}`);
      if (!res.ok) return { ok: false, message: `Gateway returned HTTP ${res.status}.` };
      const data = (await res.json()) as SmsBalanceResponse;
      if (data.error === 0) {
        const rawBal = data.data?.balance ?? data.balance ?? data.response;
        const num = rawBal != null ? parseFloat(String(rawBal)) : 0;
        const formatted = !isNaN(num) ? num.toFixed(2) : String(rawBal ?? '0.00');
        const validity = data.data?.validity ?? data.validity;
        return {
          ok: true,
          balance: formatted,
          currency: 'BDT',
          validity: validity ? String(validity) : undefined,
          message: data.msg || 'Success',
        };
      }
      return { ok: false, message: data.msg || `Gateway error (${data.error})` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Connection check failed.' };
    }
  }

  async testConnection(credentials?: ProviderCredentials): Promise<ProviderHealthCheckResult> {
    if (!this.isConfigured(credentials)) {
      return { ok: false, message: 'Provider is not configured.' };
    }
    const bal = await this.getBalance(credentials);
    if (bal.ok) {
      return { ok: true, message: `Connected successfully. Balance: ৳${bal.balance} ${bal.currency || 'BDT'}` };
    }
    return { ok: false, message: bal.message || 'Connection check failed.' };
  }

  async getDeliveryReport(requestId: string, credentials?: ProviderCredentials): Promise<ProviderReportResult> {
    if (isMockModeEnabled()) {
      return {
        ok: true,
        requestId,
        requestStatus: 'Complete',
        requestCharge: '0.3500',
        recipients: [
          { number: '8801800000000', charge: '0.3500', status: 'Sent' },
        ],
        message: 'Success (Mock mode)',
      };
    }

    if (!this.isConfigured(credentials)) {
      return { ok: false, message: 'Provider is not configured.' };
    }

    const cleanId = String(requestId).trim();
    if (!cleanId) {
      return { ok: false, message: 'Request ID is required.' };
    }

    try {
      const url = `${this.baseUrl(credentials)}/report/request/${encodeURIComponent(cleanId)}/?api_key=${encodeURIComponent(this.apiKey(credentials)!)}`;
      const res = await fetch(url);
      if (!res.ok) {
        return { ok: false, message: `Gateway returned HTTP ${res.status}.` };
      }
      const raw = await res.json();
      if (Array.isArray(raw) && raw.length === 0) {
        return { ok: false, message: `Request #${cleanId} not found in SMS gateway records.` };
      }
      const data = raw as SmsReportResponse;
      if (data.error === 0 && data.data) {
        return {
          ok: true,
          requestId: data.data.request_id ?? cleanId,
          requestStatus: data.data.request_status || 'Complete',
          requestCharge: data.data.request_charge != null ? String(data.data.request_charge) : '0.0000',
          recipients: Array.isArray(data.data.recipients) ? data.data.recipients : [],
          message: data.msg || 'Success',
        };
      }
      const errorMsg = (data.error != null && SMS_ERROR_MESSAGES[data.error]) || data.msg || `Request #${cleanId} was not found or returned an error.`;
      return { ok: false, message: errorMsg };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Connection check failed.' };
    }
  }
}

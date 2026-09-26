import type { CommunicationMessage, CommunicationProvider, CommunicationResult } from './types';

/**
 * SMS provider adapter. No live vendor is wired into this repository, so —
 * per AGENTS.md §25/§49 — this never fakes delivery. Once a real gateway
 * (e.g. an SSL Wireless / Alpha SMS style REST API) is configured via
 * server-side env vars, its call replaces the SKIPPED branch below; the rest
 * of the app never needs to change since it only depends on this interface.
 */
export class SmsProvider implements CommunicationProvider {
  readonly channel = 'SMS' as const;

  async send(_message: CommunicationMessage): Promise<CommunicationResult> {
    const apiKey = process.env.SMS_PROVIDER_API_KEY;
    const senderId = process.env.SMS_SENDER_ID;
    if (!apiKey || !senderId) {
      return { status: 'SKIPPED', provider: 'sms', errorMessage: 'PROVIDER_NOT_CONFIGURED' };
    }

    // No SMS gateway is configured/authorized for this deployment yet.
    // Intentionally not sending a live request — see class docstring.
    return { status: 'SKIPPED', provider: 'sms', errorMessage: 'PROVIDER_NOT_CONFIGURED' };
  }
}

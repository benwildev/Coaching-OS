import type { CommunicationMessage, CommunicationProvider, CommunicationResult } from './types';

/**
 * WhatsApp provider adapter. Per AGENTS.md §24, this must only ever call an
 * official WhatsApp Business Platform API — never browser automation over a
 * personal WhatsApp Web session. No official provider is configured in this
 * deployment, so every send is honestly SKIPPED until one is wired in via
 * server-side env vars (never exposed to the browser).
 */
export class WhatsAppProvider implements CommunicationProvider {
  readonly channel = 'WHATSAPP' as const;

  async send(_message: CommunicationMessage): Promise<CommunicationResult> {
    const token = process.env.WHATSAPP_BUSINESS_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) {
      return { status: 'SKIPPED', provider: 'whatsapp', errorMessage: 'PROVIDER_NOT_CONFIGURED' };
    }

    return { status: 'SKIPPED', provider: 'whatsapp', errorMessage: 'PROVIDER_NOT_CONFIGURED' };
  }
}

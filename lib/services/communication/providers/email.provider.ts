import type { CommunicationMessage, CommunicationProvider, CommunicationResult } from './types';

/**
 * Email provider adapter. No SMTP/transactional-email vendor is configured
 * in this deployment, so every send is honestly SKIPPED (AGENTS.md §49)
 * rather than faked.
 */
export class EmailProvider implements CommunicationProvider {
  readonly channel = 'EMAIL' as const;

  async send(_message: CommunicationMessage): Promise<CommunicationResult> {
    const smtpHost = process.env.EMAIL_SMTP_HOST;
    const smtpUser = process.env.EMAIL_SMTP_USER;
    if (!smtpHost || !smtpUser) {
      return { status: 'SKIPPED', provider: 'email', errorMessage: 'PROVIDER_NOT_CONFIGURED' };
    }

    return { status: 'SKIPPED', provider: 'email', errorMessage: 'PROVIDER_NOT_CONFIGURED' };
  }
}

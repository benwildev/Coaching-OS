import nodemailer, { type Transporter } from 'nodemailer';
import type { CommunicationMessage, CommunicationProvider, CommunicationResult, ProviderCredentials, ProviderHealthCheckResult } from './types';
import { getMockResult, isMockModeEnabled } from './mock';

interface SmtpErrorLike {
  code?: string;
  responseCode?: number;
  message?: string;
}

// SMTP failures that will never succeed by simply retrying the same message.
function isNonRetryableSmtpError(error: SmtpErrorLike): boolean {
  if (error.code === 'EAUTH' || error.code === 'EENVELOPE') return true;
  if (error.responseCode && error.responseCode >= 500 && error.responseCode < 600) return true; // permanent SMTP rejection
  return false;
}

/**
 * Email provider adapter using Gmail SMTP via nodemailer (per the user's
 * confirmed deployment approach). Requires a Gmail App Password, not the
 * account's normal login password — see docs/communication.md.
 *
 * Credentials resolve tenant-saved value first, then the server-side env var
 * fallback — see ProviderCredentials in ./types.
 */
export class EmailProvider implements CommunicationProvider {
  readonly channel = 'EMAIL' as const;

  private smtpHost(c?: ProviderCredentials): string {
    return c?.smtpHost || process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com';
  }

  private smtpPort(c?: ProviderCredentials): number {
    return Number(c?.smtpPort || process.env.EMAIL_SMTP_PORT) || 465;
  }

  private smtpUser(c?: ProviderCredentials): string | undefined {
    return c?.smtpUser || process.env.EMAIL_SMTP_USER;
  }

  private smtpPass(c?: ProviderCredentials): string | undefined {
    return c?.smtpPass || process.env.EMAIL_SMTP_PASS;
  }

  private fromName(c?: ProviderCredentials): string {
    return c?.fromName || process.env.EMAIL_FROM_NAME || 'Coaching Center';
  }

  isConfigured(c?: ProviderCredentials): boolean {
    return Boolean(this.smtpUser(c) && this.smtpPass(c));
  }

  private createTransporter(c?: ProviderCredentials): Transporter {
    const port = this.smtpPort(c);
    return nodemailer.createTransport({
      host: this.smtpHost(c),
      port,
      secure: port === 465,
      auth: { user: this.smtpUser(c), pass: this.smtpPass(c) },
    });
  }

  async send(message: CommunicationMessage, credentials?: ProviderCredentials): Promise<CommunicationResult> {
    if (isMockModeEnabled()) return getMockResult(this.channel, message);

    if (!this.isConfigured(credentials)) {
      return { status: 'SKIPPED', provider: 'email', errorMessage: 'PROVIDER_NOT_CONFIGURED', retryable: null };
    }

    try {
      const transporter = this.createTransporter(credentials);
      const info = await transporter.sendMail({
        from: `"${this.fromName(credentials)}" <${this.smtpUser(credentials)}>`,
        to: message.to,
        subject: message.subject || 'Notification',
        text: message.body,
        html: message.htmlBody ?? message.body.replace(/\n/g, '<br>'),
      });
      return { status: 'SENT', provider: 'email', providerMessageId: info.messageId };
    } catch (error) {
      const err = error as SmtpErrorLike;
      return {
        status: 'FAILED',
        provider: 'email',
        errorCode: err.code || (err.responseCode != null ? String(err.responseCode) : 'SMTP_ERROR'),
        errorMessage: err.message || 'Failed to send email',
        retryable: !isNonRetryableSmtpError(err),
      };
    }
  }

  async testConnection(credentials?: ProviderCredentials): Promise<ProviderHealthCheckResult> {
    if (!this.isConfigured(credentials)) {
      return { ok: false, message: 'Provider is not configured.' };
    }
    try {
      const transporter = this.createTransporter(credentials);
      await transporter.verify();
      return { ok: true, message: 'Connected successfully.' };
    } catch (error) {
      const err = error as SmtpErrorLike;
      return { ok: false, message: err.message || 'Connection check failed.' };
    }
  }
}

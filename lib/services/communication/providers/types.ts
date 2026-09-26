import type { CommunicationChannel } from '@prisma/client';

export interface CommunicationMessage {
  to: string; // phone number or email address, depending on the channel
  subject?: string; // used by EMAIL only
  body: string;
}

export interface CommunicationResult {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  providerMessageId?: string | null;
  provider?: string | null;
  errorMessage?: string | null;
}

export interface CommunicationProvider {
  readonly channel: CommunicationChannel;
  send(message: CommunicationMessage): Promise<CommunicationResult>;
}

import type { CommunicationChannel } from '@prisma/client';
import type { CommunicationProvider } from './types';
import { SmsProvider } from './sms.provider';
import { WhatsAppProvider } from './whatsapp.provider';
import { EmailProvider } from './email.provider';

export type { CommunicationMessage, CommunicationProvider, CommunicationResult } from './types';

const PROVIDERS: Record<CommunicationChannel, CommunicationProvider> = {
  SMS: new SmsProvider(),
  WHATSAPP: new WhatsAppProvider(),
  EMAIL: new EmailProvider(),
};

export function getCommunicationProvider(channel: CommunicationChannel): CommunicationProvider {
  return PROVIDERS[channel];
}

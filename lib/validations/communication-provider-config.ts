import { z } from 'zod';
import { COMMUNICATION_CHANNELS } from './communication-template';

// Values may be an empty string (explicitly clears a previously-saved
// field) — the service layer drops any key that isn't a recognized field
// for the given channel, so an unexpected key here is harmless, not a
// validation error.
export const communicationCredentialsUpdateSchema = z.object({
  channel: z.enum(COMMUNICATION_CHANNELS),
  credentials: z.record(z.string(), z.string().max(500)),
});
export type CommunicationCredentialsUpdateInput = z.infer<typeof communicationCredentialsUpdateSchema>;

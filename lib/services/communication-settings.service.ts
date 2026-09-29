import prisma from '@/lib/db';
import type { CommunicationChannel } from '@prisma/client';
import type { SessionUser } from '@/lib/auth/session';
import { recordAuditLog } from './audit.service';
import { getSystemSettings, updateSystemSetting } from './settings.service';
import { getCommunicationProvider, type ProviderCredentials, type ProviderBalanceResult, type ProviderReportResult } from './communication/providers';
import { decryptCredentials, encryptCredentials } from './crypto.service';

// Per-tenant channel enable/disable toggle. Reuses the existing generic
// SystemSetting key/value store (already documented for a NOTIFICATION
// group) — no secrets are stored here, only a boolean.
const CHANNELS: CommunicationChannel[] = ['SMS', 'WHATSAPP', 'EMAIL'];
const SETTING_KEY = (channel: CommunicationChannel) => `comm.${channel.toLowerCase()}.enabled`;
const SETTING_GROUP = 'NOTIFICATION';

export interface ProviderFieldDef {
  key: string;
  label: string;
  secret: boolean; // masked in the UI / never echoed back once saved
  required: boolean;
}

// WhatsApp's appSecret/webhookVerifyToken are deliberately NOT here: they
// belong to the one Meta App that owns the webhook subscription, not to an
// individual tenant's phone number, and a webhook must verify a payload's
// signature before it can know which tenant the message even belongs to —
// so those two stay env-var-only globals (see docs/communication.md).
export const PROVIDER_CREDENTIAL_FIELDS: Record<CommunicationChannel, ProviderFieldDef[]> = {
  SMS: [
    { key: 'apiKey', label: 'API Key', secret: true, required: true },
    { key: 'senderId', label: 'Sender ID (optional, leave blank for non-masking)', secret: false, required: false },
    { key: 'baseUrl', label: 'API Base URL (optional, default https://api.sms.net.bd)', secret: false, required: false },
  ],
  WHATSAPP: [
    { key: 'token', label: 'Business API Token', secret: true, required: true },
    { key: 'phoneNumberId', label: 'Phone Number ID', secret: false, required: true },
    { key: 'apiVersion', label: 'API Version (optional)', secret: false, required: false },
  ],
  EMAIL: [
    { key: 'smtpHost', label: 'SMTP Host (optional, default smtp.gmail.com)', secret: false, required: false },
    { key: 'smtpPort', label: 'SMTP Port (optional, default 465)', secret: false, required: false },
    { key: 'smtpUser', label: 'SMTP Username / Email Address', secret: false, required: true },
    { key: 'smtpPass', label: 'SMTP Password (Gmail App Password)', secret: true, required: true },
    { key: 'fromName', label: 'From Name (optional)', secret: false, required: false },
  ],
};

export interface CommunicationChannelStatus {
  channel: CommunicationChannel;
  configured: boolean;
  enabled: boolean;
  fields: (ProviderFieldDef & { set: boolean })[];
}

function assertCommunicationSettingsManageable(user: SessionUser) {
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    throw new Error('COMMUNICATION_SETTINGS_ACCESS_DENIED: only Owner or Admin can manage communication provider settings');
  }
}

/**
 * Decrypts the tenant's saved credentials for a channel, or {} if none were
 * ever saved via the settings UI — providers then fall back to their own
 * env vars for whatever key is still missing. Never throws outward: a
 * corrupted/undecryptable row degrades to "use the env var fallback"
 * instead of breaking every send for that tenant.
 */
export async function resolveProviderCredentials(coachingCenterId: string, channel: CommunicationChannel): Promise<ProviderCredentials> {
  const row = await prisma.communicationProviderConfig.findUnique({
    where: { coachingCenterId_channel: { coachingCenterId, channel } },
    select: { credentialsEncrypted: true },
  });
  if (!row) return {};
  try {
    return decryptCredentials(row.credentialsEncrypted);
  } catch (error) {
    console.error(`[CommunicationSettings] Failed to decrypt ${channel} credentials for tenant ${coachingCenterId}:`, error);
    return {};
  }
}

function fieldStatus(channel: CommunicationChannel, credentials: ProviderCredentials): (ProviderFieldDef & { set: boolean })[] {
  return PROVIDER_CREDENTIAL_FIELDS[channel].map((f) => ({ ...f, set: Boolean(credentials[f.key]) }));
}

/** Configured-only status, safe for any authenticated tenant member (no management access implied). */
export async function getCommunicationChannelConfiguredStatus(coachingCenterId: string): Promise<Record<CommunicationChannel, boolean>> {
  const result = {} as Record<CommunicationChannel, boolean>;
  for (const channel of CHANNELS) {
    const credentials = await resolveProviderCredentials(coachingCenterId, channel);
    result[channel] = getCommunicationProvider(channel).isConfigured(credentials);
  }
  return result;
}

export async function getCommunicationProviderStatus(coachingCenterId: string): Promise<CommunicationChannelStatus[]> {
  const settings = await getSystemSettings(coachingCenterId);
  const result: CommunicationChannelStatus[] = [];
  for (const channel of CHANNELS) {
    const credentials = await resolveProviderCredentials(coachingCenterId, channel);
    result.push({
      channel,
      configured: getCommunicationProvider(channel).isConfigured(credentials),
      enabled: settings[SETTING_KEY(channel)] !== 'false', // default enabled when unset
      fields: fieldStatus(channel, credentials),
    });
  }
  return result;
}

export async function setCommunicationChannelEnabled(
  coachingCenterId: string,
  user: SessionUser,
  channel: CommunicationChannel,
  enabled: boolean
) {
  assertCommunicationSettingsManageable(user);
  await updateSystemSetting(coachingCenterId, SETTING_KEY(channel), String(enabled), SETTING_GROUP, user.userId);

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: enabled ? 'COMMUNICATION_PROVIDER_ENABLED' : 'COMMUNICATION_PROVIDER_DISABLED',
    entity: 'SystemSetting',
    entityId: null,
    details: { channel },
  });

  return getCommunicationProviderStatus(coachingCenterId);
}

/**
 * Saves (merges into) a tenant's provider credentials. A field omitted from
 * `input` keeps its previously-saved value; an explicit empty string clears
 * it. Values are encrypted before being written — the audit log records
 * only which field *names* changed, never their values.
 */
export async function saveProviderCredentials(
  coachingCenterId: string,
  user: SessionUser,
  channel: CommunicationChannel,
  input: Record<string, string | undefined>
) {
  assertCommunicationSettingsManageable(user);
  const allowedKeys = new Set(PROVIDER_CREDENTIAL_FIELDS[channel].map((f) => f.key));

  const existing = await resolveProviderCredentials(coachingCenterId, channel);
  const merged: ProviderCredentials = { ...existing };
  const changedKeys: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.has(key) || value === undefined) continue;
    merged[key] = value === '' ? undefined : value.trim();
    if (channel === 'SMS' && key === 'baseUrl' && merged.baseUrl) {
      let clean = merged.baseUrl.trim();
      if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `https://${clean}`;
      }
      clean = clean.replace(/\/+$/, '').replace(/\/(sendsms|user\/balance|balance).*$/i, '');
      merged.baseUrl = clean || undefined;
    }
    changedKeys.push(key);
  }

  const encrypted = encryptCredentials(merged);
  await prisma.communicationProviderConfig.upsert({
    where: { coachingCenterId_channel: { coachingCenterId, channel } },
    update: { credentialsEncrypted: encrypted, updatedById: user.userId },
    create: { coachingCenterId, channel, credentialsEncrypted: encrypted, updatedById: user.userId },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'COMMUNICATION_CREDENTIALS_UPDATED',
    entity: 'CommunicationProviderConfig',
    entityId: null,
    details: { channel, changedFields: changedKeys },
  });

  return getCommunicationProviderStatus(coachingCenterId);
}

export async function isCommunicationChannelEnabled(coachingCenterId: string, channel: CommunicationChannel): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({
    where: { coachingCenterId_key: { coachingCenterId, key: SETTING_KEY(channel) } },
    select: { value: true },
  });
  return setting?.value !== 'false';
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  testMessageSent?: boolean;
  providerMessageId?: string | null;
}

export async function testCommunicationProvider(
  coachingCenterId: string,
  user: SessionUser,
  channel: CommunicationChannel,
  testRecipient?: string
): Promise<TestConnectionResult> {
  assertCommunicationSettingsManageable(user);
  const provider = getCommunicationProvider(channel);
  const credentials = await resolveProviderCredentials(coachingCenterId, channel);

  const health = await provider.testConnection(credentials);

  let testMessageSent = false;
  let providerMessageId: string | null = null;
  if (health.ok && testRecipient) {
    const result = await provider.send(
      {
        to: testRecipient,
        subject: 'Test message',
        body: 'This is a test message from your coaching center communication settings.',
      },
      credentials
    );
    testMessageSent = result.status === 'SENT';
    providerMessageId = result.providerMessageId ?? null;
  }

  await recordAuditLog({
    coachingCenterId,
    userId: user.userId,
    action: 'COMMUNICATION_TEST_CONNECTION',
    entity: 'SystemSetting',
    entityId: null,
    details: { channel, ok: health.ok, testMessageSent, providerMessageId },
  });

  return { ...health, testMessageSent, providerMessageId };
}

export async function getProviderBalance(
  coachingCenterId: string,
  user: SessionUser,
  channel: CommunicationChannel
): Promise<ProviderBalanceResult> {
  assertCommunicationSettingsManageable(user);
  const provider = getCommunicationProvider(channel);
  const credentials = await resolveProviderCredentials(coachingCenterId, channel);
  if (provider.getBalance) {
    return provider.getBalance(credentials);
  }
  return { ok: false, message: 'Balance check is not supported for this channel.' };
}

export async function getSmsDeliveryReport(
  coachingCenterId: string,
  user: SessionUser,
  requestId: string
): Promise<ProviderReportResult> {
  assertCommunicationSettingsManageable(user);
  const provider = getCommunicationProvider('SMS');
  const credentials = await resolveProviderCredentials(coachingCenterId, 'SMS');
  if (provider.getDeliveryReport) {
    return provider.getDeliveryReport(requestId, credentials);
  }
  return { ok: false, message: 'Delivery report is not supported for SMS provider.' };
}

export async function getRecentSmsLogs(coachingCenterId: string, limit = 10) {
  const rows = await prisma.communicationLog.findMany({
    where: {
      coachingCenterId,
      channel: 'SMS',
    },
    select: {
      id: true,
      recipientPhone: true,
      status: true,
      providerMessageId: true,
      message: true,
      createdAt: true,
      sentAt: true,
      errorMessage: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows;
}

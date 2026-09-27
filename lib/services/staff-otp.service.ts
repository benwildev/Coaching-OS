import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import prisma from '@/lib/db';
import { getCommunicationProvider } from './communication/providers';
import { recordAuditLog } from './audit.service';
import { staffIdentityInclude, toStaffIdentity, type StaffIdentity } from './user.service';

/**
 * Staff "Mobile + OTP" sign-in.
 *
 * Security properties:
 *  - a code is issued only when the phone matches exactly ONE active staff
 *    user (never a guess across tenants, never a fallback account);
 *  - codes are 6 random digits; only an HMAC (keyed with AUTH_SECRET and
 *    bound to the challenge id) is stored;
 *  - expires after OTP_TTL_MINUTES, consumed atomically exactly once,
 *    at most OTP_MAX_ATTEMPTS wrong guesses, at most OTP_MAX_ISSUES codes per
 *    phone per OTP_ISSUE_WINDOW_MINUTES;
 *  - there is no fixed/demo code anywhere.
 *
 * Delivery uses the Phase 8 SMS provider. It is not configured in this
 * deployment, so in production no code is issued at all
 * (OTP_UNAVAILABLE). For local development only, AUTH_DEV_OTP_ECHO=true
 * (ignored when NODE_ENV=production) returns the random code in the API
 * response instead of sending it.
 */

export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_ISSUES = 5;
const OTP_ISSUE_WINDOW_MINUTES = 15;

const SECRET = process.env.AUTH_SECRET || 'coaching-os-bangladesh-production-secret-key-32chars';

export function isDevOtpEchoEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.AUTH_DEV_OTP_ECHO === 'true';
}

/** The SMS provider is a stub that never delivers (see sms.provider.ts). */
function isSmsDeliveryConfigured(): boolean {
  return false;
}

export function isOtpLoginAvailable(): boolean {
  return isSmsDeliveryConfigured() || isDevOtpEchoEnabled();
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  // +8801XXXXXXXXX / 8801XXXXXXXXX → 01XXXXXXXXX
  return digits.startsWith('880') && digits.length === 13 ? digits.slice(2) : digits;
}

function codeHash(challengeId: string, code: string): string {
  return createHmac('sha256', SECRET).update(`${challengeId}:${code}`).digest('hex');
}

async function findUniqueStaffByPhone(phone: string) {
  const users = await prisma.user.findMany({
    where: { phone: { in: Array.from(new Set([phone, normalizePhone(phone)])) }, status: 'ACTIVE' },
    include: staffIdentityInclude,
    take: 2,
  });
  return users.length === 1 ? users[0] : null;
}

export type IssueOtpOutcome =
  | { issued: false; reason: 'UNAVAILABLE' | 'NO_UNIQUE_ACCOUNT' | 'RATE_LIMITED' }
  | { issued: true; challengeId: string; code: string; delivered: boolean };

/**
 * Creates a challenge for the single staff user owning `phone`. Returns the
 * raw code to the server-side caller only; the route decides whether it may
 * be echoed (development only). Never reveals whether the phone exists.
 */
export async function issueStaffLoginOtp(rawPhone: string, opts: { requireDelivery: boolean } = { requireDelivery: true }): Promise<IssueOtpOutcome> {
  const phone = normalizePhone(rawPhone);
  if (phone.length !== 11) return { issued: false, reason: 'NO_UNIQUE_ACCOUNT' };
  if (opts.requireDelivery && !isOtpLoginAvailable()) return { issued: false, reason: 'UNAVAILABLE' };

  const user = await findUniqueStaffByPhone(phone);
  if (!user || !toStaffIdentity(user)) return { issued: false, reason: 'NO_UNIQUE_ACCOUNT' };

  const recent = await prisma.staffLoginOtp.count({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - OTP_ISSUE_WINDOW_MINUTES * 60 * 1000) } },
  });
  if (recent >= OTP_MAX_ISSUES) return { issued: false, reason: 'RATE_LIMITED' };

  // Only the newest challenge per user is ever valid.
  await prisma.staffLoginOtp.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const id = randomUUID();
  const challenge = await prisma.staffLoginOtp.create({
    data: {
      id,
      coachingCenterId: user.coachingCenterId,
      userId: user.id,
      phone,
      codeHash: codeHash(id, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  });

  let delivered = false;
  if (isSmsDeliveryConfigured()) {
    const result = await getCommunicationProvider('SMS').send({ to: phone, body: `Your Coaching OS sign-in code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.` });
    delivered = result.status === 'SENT';
  }

  await recordAuditLog({
    coachingCenterId: user.coachingCenterId,
    userId: user.id,
    action: 'STAFF_OTP_ISSUED',
    entity: 'StaffLoginOtp',
    entityId: challenge.id,
    details: { delivered },
  });

  return { issued: true, challengeId: challenge.id, code, delivered };
}

/**
 * Verifies a code for `phone`. Success consumes the challenge atomically
 * (a concurrent or repeated submit of the same code fails). Returns the
 * bound user's identity, re-checked as ACTIVE at verification time.
 */
export async function verifyStaffLoginOtp(rawPhone: string, code: string): Promise<StaffIdentity | null> {
  const phone = normalizePhone(rawPhone);
  if (!/^\d{6}$/.test(code)) return null;

  const challenge = await prisma.staffLoginOtp.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= OTP_MAX_ATTEMPTS) return null;

  const expected = Buffer.from(challenge.codeHash, 'hex');
  const actual = Buffer.from(codeHash(challenge.id, code), 'hex');
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await prisma.staffLoginOtp.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return null;
  }

  const consumed = await prisma.staffLoginOtp.updateMany({
    where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) return null;

  const user = await prisma.user.findFirst({ where: { id: challenge.userId, coachingCenterId: challenge.coachingCenterId }, include: staffIdentityInclude });
  if (!user || user.status !== 'ACTIVE') return null;
  const identity = toStaffIdentity(user);
  if (!identity) return null;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return identity;
}

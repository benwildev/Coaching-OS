import { randomBytes, createHash } from 'node:crypto';
import prisma from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import type { PortalSessionUser } from '@/lib/auth/portal-session';
import { recordAuditLog } from './audit.service';
import type { Prisma } from '@prisma/client';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SETUP_TOKEN_HOURS = 48;
const RESET_TOKEN_HOURS = 1;

type PortalAccountWithIdentity = Prisma.PortalAccountGetPayload<{
  include: { student: { select: { id: true; name: true; banglaName: true } }; guardian: { select: { id: true; name: true; banglaName: true } } };
}>;

function toSessionUser(account: PortalAccountWithIdentity): PortalSessionUser {
  const name = account.portalType === 'STUDENT' ? account.student?.name : account.guardian?.name;
  return {
    portalAccountId: account.id,
    portalType: account.portalType,
    studentId: account.studentId,
    guardianId: account.guardianId,
    coachingCenterId: account.coachingCenterId,
    name: name || '',
  };
}

const identityInclude = {
  student: { select: { id: true, name: true, banglaName: true } },
  guardian: { select: { id: true, name: true, banglaName: true } },
} satisfies Prisma.PortalAccountInclude;

/**
 * Finds a PortalAccount by phone, email, or (for students) Student ID code.
 * Mirrors authenticateUser's global findFirst-by-identifier pattern in
 * user.service.ts for consistency — the same cross-tenant-identifier
 * collision model the existing staff login already accepts.
 */
async function findAccountByIdentifier(identifier: string): Promise<PortalAccountWithIdentity | null> {
  const raw = identifier.trim();
  const normalizedEmail = raw.toLowerCase();

  const byContact = await prisma.portalAccount.findFirst({
    where: { OR: [{ email: normalizedEmail }, { phone: raw }] },
    include: identityInclude,
  });
  if (byContact) return byContact;

  // Student ID code login (e.g. "ACC-26-00001")
  const student = await prisma.student.findFirst({ where: { studentIdCode: raw }, select: { id: true } });
  if (!student) return null;
  return prisma.portalAccount.findFirst({ where: { studentId: student.id }, include: identityInclude });
}

export interface AuthenticateResult {
  session: PortalSessionUser;
  accountId: string;
}

/**
 * Verifies credentials and applies the lockout policy. Never throws for
 * "wrong password" (returns null) — only throws for account-state issues
 * that the caller maps to a distinct message (locked/disabled/no password
 * set yet).
 */
export async function authenticatePortalAccount(identifier: string, plainPassword: string): Promise<AuthenticateResult | null> {
  const account = await findAccountByIdentifier(identifier);
  if (!account) return null;

  if (account.status === 'DISABLED') throw new Error('PORTAL_ACCOUNT_DISABLED');
  if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) throw new Error('PORTAL_ACCOUNT_LOCKED');
  if (!account.passwordHash) throw new Error('PORTAL_PASSWORD_NOT_SET');

  const isValid = verifyPassword(plainPassword, account.passwordHash);
  if (!isValid) {
    const attempts = account.failedLoginAttempts + 1;
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
    await prisma.portalAccount.update({
      where: { id: account.id },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });
    if (lockedUntil) {
      await recordAuditLog({
        coachingCenterId: account.coachingCenterId,
        studentId: account.studentId,
        guardianId: account.guardianId,
        action: 'PORTAL_ACCOUNT_LOCKED',
        entity: 'PortalAccount',
        entityId: account.id,
        details: { attempts },
      });
    }
    return null;
  }

  await prisma.portalAccount.update({
    where: { id: account.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  return { session: toSessionUser(account), accountId: account.id };
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Creates (or finds) a PortalAccount for a Student/Guardian and issues a
 * SETUP token. Since no SMS/email provider is configured in this
 * deployment, the raw setup link is returned for staff to relay manually —
 * never claimed as "sent" (AGENTS.md §9/§49 honesty rule, same as Phase 8).
 */
export async function provisionPortalAccount(params: {
  coachingCenterId: string;
  studentId?: string;
  guardianId?: string;
  actorUserId?: string;
}): Promise<{ account: { id: string; portalType: 'STUDENT' | 'GUARDIAN' }; setupToken: string; expiresAt: Date }> {
  if ((params.studentId && params.guardianId) || (!params.studentId && !params.guardianId)) {
    throw new Error('INVALID_PORTAL_IDENTITY: exactly one of studentId or guardianId is required');
  }

  let account = params.studentId
    ? await prisma.portalAccount.findUnique({ where: { studentId: params.studentId } })
    : await prisma.portalAccount.findUnique({ where: { guardianId: params.guardianId! } });

  if (!account) {
    const contact = params.studentId
      ? await prisma.student.findFirst({ where: { id: params.studentId, coachingCenterId: params.coachingCenterId }, select: { phone: true, email: true } })
      : await prisma.guardian.findFirst({ where: { id: params.guardianId!, coachingCenterId: params.coachingCenterId }, select: { phone: true, email: true } });
    if (!contact) throw new Error(params.studentId ? 'STUDENT_NOT_FOUND' : 'GUARDIAN_NOT_FOUND');

    account = await prisma.portalAccount.create({
      data: {
        coachingCenterId: params.coachingCenterId,
        portalType: params.studentId ? 'STUDENT' : 'GUARDIAN',
        studentId: params.studentId ?? null,
        guardianId: params.guardianId ?? null,
        phone: contact.phone,
        email: contact.email,
      },
    });
  }

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_HOURS * 60 * 60 * 1000);
  await prisma.portalAuthToken.create({
    data: { portalAccountId: account.id, tokenHash: hashToken(rawToken), purpose: 'SETUP', expiresAt },
  });

  await recordAuditLog({
    coachingCenterId: params.coachingCenterId,
    userId: params.actorUserId,
    action: 'PORTAL_ACCOUNT_PROVISIONED',
    entity: 'PortalAccount',
    entityId: account.id,
    details: { portalType: account.portalType },
  });

  return { account: { id: account.id, portalType: account.portalType }, setupToken: rawToken, expiresAt };
}

/** Always returns the same generic outcome — never reveals whether an account exists (AGENTS.md §9). */
export async function requestPasswordReset(identifier: string): Promise<void> {
  const account = await findAccountByIdentifier(identifier);
  if (!account || account.status === 'DISABLED') return;

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000);
  await prisma.portalAuthToken.create({
    data: { portalAccountId: account.id, tokenHash: hashToken(rawToken), purpose: 'RESET', expiresAt },
  });

  await recordAuditLog({
    coachingCenterId: account.coachingCenterId,
    studentId: account.studentId,
    guardianId: account.guardianId,
    action: 'PORTAL_PASSWORD_RESET_REQUESTED',
    entity: 'PortalAccount',
    entityId: account.id,
    details: null,
  });

  // No SMS/WhatsApp/Email provider is configured in this deployment (Phase 8
  // provider architecture) — the token exists, but nothing is actually
  // delivered. A real deployment would dispatch `rawToken` via the
  // guardian/student's preferred channel here.
}

/** Consumes a SETUP or RESET token exactly once. */
export async function completeSetupOrReset(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.portalAuthToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new Error('TOKEN_INVALID_OR_EXPIRED');
  }

  const account = await prisma.portalAccount.findUnique({ where: { id: record.portalAccountId } });
  if (!account) throw new Error('TOKEN_INVALID_OR_EXPIRED');

  await prisma.$transaction([
    prisma.portalAuthToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.portalAccount.update({
      where: { id: account.id },
      data: { passwordHash: hashPassword(newPassword), failedLoginAttempts: 0, lockedUntil: null },
    }),
  ]);

  await recordAuditLog({
    coachingCenterId: account.coachingCenterId,
    studentId: account.studentId,
    guardianId: account.guardianId,
    action: record.purpose === 'SETUP' ? 'PORTAL_PASSWORD_SETUP' : 'PORTAL_PASSWORD_RESET',
    entity: 'PortalAccount',
    entityId: account.id,
    details: null,
  });
}

export async function changePassword(session: PortalSessionUser, currentPassword: string, newPassword: string): Promise<void> {
  const account = await prisma.portalAccount.findUnique({ where: { id: session.portalAccountId } });
  if (!account || !account.passwordHash) throw new Error('PORTAL_PASSWORD_NOT_SET');
  if (!verifyPassword(currentPassword, account.passwordHash)) throw new Error('PORTAL_INVALID_CREDENTIALS');

  await prisma.portalAccount.update({
    where: { id: account.id },
    data: { passwordHash: hashPassword(newPassword) },
  });

  await recordAuditLog({
    coachingCenterId: session.coachingCenterId,
    studentId: session.studentId,
    guardianId: session.guardianId,
    action: 'PORTAL_PASSWORD_CHANGED',
    entity: 'PortalAccount',
    entityId: account.id,
    details: null,
  });
}

/** The core IDOR guard for every guardian/[studentId] route (AGENTS.md §34/§39). */
export async function assertGuardianOwnsStudent(coachingCenterId: string, guardianId: string, studentId: string): Promise<void> {
  const link = await prisma.studentGuardian.findFirst({
    where: { guardianId, studentId, student: { coachingCenterId } },
    select: { id: true },
  });
  if (!link) throw new Error('STUDENT_NOT_LINKED');
}

// ------------------------------------------------------------------
// Staff-side portal account administration (Phase 9 §23)
// ------------------------------------------------------------------
//
// No SMS/email provider is configured in this deployment, so unlike the
// self-service requestPasswordReset() above (which deliberately never
// reveals the token), these staff-only functions return the raw
// setup/reset link for a staff member to relay manually — same honesty
// contract as provisionPortalAccount's setupToken.

export interface PortalAccountStatusView {
  id: string;
  portalType: 'STUDENT' | 'GUARDIAN';
  status: 'ACTIVE' | 'DISABLED';
  hasPassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export async function getPortalAccountStatus(
  coachingCenterId: string,
  identity: { studentId?: string; guardianId?: string }
): Promise<PortalAccountStatusView | null> {
  if ((identity.studentId && identity.guardianId) || (!identity.studentId && !identity.guardianId)) {
    throw new Error('INVALID_PORTAL_IDENTITY');
  }
  const account = identity.studentId
    ? await prisma.portalAccount.findFirst({ where: { studentId: identity.studentId, coachingCenterId } })
    : await prisma.portalAccount.findFirst({ where: { guardianId: identity.guardianId, coachingCenterId } });
  if (!account) return null;

  return {
    id: account.id,
    portalType: account.portalType,
    status: account.status,
    hasPassword: !!account.passwordHash,
    failedLoginAttempts: account.failedLoginAttempts,
    lockedUntil: account.lockedUntil,
    lastLoginAt: account.lastLoginAt,
    createdAt: account.createdAt,
  };
}

/** Wraps provisionPortalAccount for a staff caller and reports the raw setup link's token. */
export async function staffProvisionPortalAccount(
  coachingCenterId: string,
  actorUserId: string,
  identity: { studentId?: string; guardianId?: string }
): Promise<{ portalAccountId: string; setupToken: string; expiresAt: Date }> {
  const result = await provisionPortalAccount({ coachingCenterId, ...identity, actorUserId });
  return { portalAccountId: result.account.id, setupToken: result.setupToken, expiresAt: result.expiresAt };
}

/** Staff-triggered password reset — issues a RESET token and returns it (never delivered automatically). */
export async function staffIssueResetLink(
  coachingCenterId: string,
  actorUserId: string,
  portalAccountId: string
): Promise<{ resetToken: string; expiresAt: Date }> {
  const account = await prisma.portalAccount.findFirst({ where: { id: portalAccountId, coachingCenterId } });
  if (!account) throw new Error('PORTAL_ACCOUNT_NOT_FOUND');

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000);
  await prisma.portalAuthToken.create({
    data: { portalAccountId: account.id, tokenHash: hashToken(rawToken), purpose: 'RESET', expiresAt },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorUserId,
    studentId: account.studentId,
    guardianId: account.guardianId,
    action: 'PORTAL_PASSWORD_RESET_ISSUED_BY_STAFF',
    entity: 'PortalAccount',
    entityId: account.id,
    details: null,
  });

  return { resetToken: rawToken, expiresAt };
}

export async function setPortalAccountStatus(
  coachingCenterId: string,
  actorUserId: string,
  portalAccountId: string,
  status: 'ACTIVE' | 'DISABLED'
): Promise<void> {
  const account = await prisma.portalAccount.findFirst({ where: { id: portalAccountId, coachingCenterId } });
  if (!account) throw new Error('PORTAL_ACCOUNT_NOT_FOUND');

  await prisma.portalAccount.update({
    where: { id: account.id },
    data: status === 'ACTIVE' ? { status, failedLoginAttempts: 0, lockedUntil: null } : { status },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorUserId,
    studentId: account.studentId,
    guardianId: account.guardianId,
    action: status === 'ACTIVE' ? 'PORTAL_ACCOUNT_ENABLED' : 'PORTAL_ACCOUNT_DISABLED',
    entity: 'PortalAccount',
    entityId: account.id,
    details: null,
  });
}

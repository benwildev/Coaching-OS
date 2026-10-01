import { randomBytes, createHash } from 'node:crypto';
import prisma from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import type { PortalSessionUser } from '@/lib/auth/portal-session';
import { recordAuditLog } from './audit.service';
import { checkPortalAccountLimit } from './subscription.service';
import type { Prisma } from '@prisma/client';

const SETUP_TOKEN_HOURS = 48;
const RESET_TOKEN_HOURS = 1;

// Sign-in itself lives in unified-auth.service.ts (the single /login path);
// this module owns portal identity shaping, setup/reset tokens and the
// guardian→student IDOR guard.

export const portalIdentityInclude = {
  student: { select: { id: true, name: true, banglaName: true } },
  guardian: { select: { id: true, name: true, banglaName: true } },
  // Phase 11.4: a suspended tenant's portal sessions are invalid immediately.
  coachingCenter: { select: { status: true } },
} satisfies Prisma.PortalAccountInclude;

type PortalAccountWithIdentity = Prisma.PortalAccountGetPayload<{ include: typeof portalIdentityInclude }>;

export function toPortalSessionUser(account: PortalAccountWithIdentity): PortalSessionUser {
  const name = account.portalType === 'STUDENT' ? account.student?.name : account.guardian?.name;
  return {
    portalAccountId: account.id,
    portalType: account.portalType,
    studentId: account.studentId,
    guardianId: account.guardianId,
    coachingCenterId: account.coachingCenterId,
    name: name || '',
    sessionVersion: account.sessionVersion,
  };
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

  // Phase 10.4: tenant-scoped lookup (was a bare findUnique on studentId/
  // guardianId with no coachingCenterId filter) — an OWNER/ADMIN of tenant A
  // who knew a tenant-B student/guardian id could otherwise find and
  // re-provision tenant B's existing portal account and get a working setup
  // link for it. Scoping to this caller's tenant here means a foreign id
  // simply looks like "no account yet", and the contact lookup right below
  // (already tenant-scoped) then correctly rejects it as NOT_FOUND instead
  // of creating or touching another tenant's account.
  let account = params.studentId
    ? await prisma.portalAccount.findFirst({ where: { studentId: params.studentId, coachingCenterId: params.coachingCenterId } })
    : await prisma.portalAccount.findFirst({ where: { guardianId: params.guardianId!, coachingCenterId: params.coachingCenterId } });

  if (!account) {
    const contact = params.studentId
      ? await prisma.student.findFirst({ where: { id: params.studentId, coachingCenterId: params.coachingCenterId }, select: { phone: true, email: true } })
      : await prisma.guardian.findFirst({ where: { id: params.guardianId!, coachingCenterId: params.coachingCenterId }, select: { phone: true, email: true } });
    if (!contact) throw new Error(params.studentId ? 'STUDENT_NOT_FOUND' : 'GUARDIAN_NOT_FOUND');

    // Phase 11.4: portal accounts are limited separately from student records.
    account = await prisma.$transaction(async (tx) => {
      await checkPortalAccountLimit(tx, params.coachingCenterId);
      return tx.portalAccount.create({
        data: {
          coachingCenterId: params.coachingCenterId,
          portalType: params.studentId ? 'STUDENT' : 'GUARDIAN',
          studentId: params.studentId ?? null,
          guardianId: params.guardianId ?? null,
          phone: contact.phone,
          email: contact.email,
        },
      });
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

export interface ProvisionStudentPortalResultSuccess {
  status: 'SUCCESS';
  portalAccount: {
    id: string;
    loginIdentifier: string;
    setupToken: string;
    setupLink: string;
    expiresAt: string;
  };
}

export interface ProvisionStudentPortalResultQuotaExceeded {
  status: 'QUOTA_EXCEEDED';
}

export type ProvisionStudentPortalResult =
  | ProvisionStudentPortalResultSuccess
  | ProvisionStudentPortalResultQuotaExceeded;

/**
 * Phase 13.1: Transaction-safe automatic student portal account provisioning.
 * Executes within the student admission transaction. If portal account quota
 * is exhausted, student admission still succeeds and returns status: QUOTA_EXCEEDED.
 */
export async function provisionStudentPortalAccount(
  tx: Prisma.TransactionClient,
  params: {
    coachingCenterId: string;
    studentId: string;
    phone?: string | null;
    email?: string | null;
    studentIdCode?: string | null;
    actorUserId?: string;
  }
): Promise<ProvisionStudentPortalResult> {
  // Check portal account limit under advisory lock
  try {
    await checkPortalAccountLimit(tx, params.coachingCenterId);
  } catch (limitErr: any) {
    const msg = String(limitErr?.message || '');
    if (
      msg.includes('PORTAL_LIMIT_REACHED') ||
      msg.includes('Portal account limit reached') ||
      msg.includes('SUBSCRIPTION_INACTIVE') ||
      msg.includes('TENANT_SUSPENDED')
    ) {
      return { status: 'QUOTA_EXCEEDED' };
    }
    throw limitErr;
  }

  // Find existing or create new PortalAccount
  let account = await tx.portalAccount.findFirst({
    where: { studentId: params.studentId, coachingCenterId: params.coachingCenterId },
  });

  if (!account) {
    account = await tx.portalAccount.create({
      data: {
        coachingCenterId: params.coachingCenterId,
        portalType: 'STUDENT',
        studentId: params.studentId,
        phone: params.phone || null,
        email: params.email ? params.email.trim().toLowerCase() : null,
        status: 'ACTIVE',
      },
    });
  }

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_HOURS * 60 * 60 * 1000);
  await tx.portalAuthToken.create({
    data: {
      portalAccountId: account.id,
      tokenHash: hashToken(rawToken),
      purpose: 'SETUP',
      expiresAt,
    },
  });

  await recordAuditLog(
    {
      coachingCenterId: params.coachingCenterId,
      userId: params.actorUserId,
      studentId: params.studentId,
      action: 'STUDENT_PORTAL_ACCOUNT_CREATED',
      entity: 'PortalAccount',
      entityId: account.id,
      details: { portalType: 'STUDENT' },
    },
    tx
  );

  const loginIdentifier = params.phone || params.email || params.studentIdCode || '';

  return {
    status: 'SUCCESS',
    portalAccount: {
      id: account.id,
      loginIdentifier,
      setupToken: rawToken,
      setupLink: `/portal/setup-password?token=${rawToken}`,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

/**
 * Self-service reset request from the unified /forgot-password page.
 * Always returns the same generic outcome — never reveals whether (or what
 * kind of) account owns the email. A token is issued only when the email
 * identifies exactly ONE active portal account across all tenants; an
 * ambiguous email issues nothing (the centre can issue a link instead).
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const accounts = await prisma.portalAccount.findMany({
    where: { email: { equals: email, mode: 'insensitive' }, status: 'ACTIVE' },
    take: 2,
  });
  if (accounts.length !== 1) return;
  const account = accounts[0];

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

  // Atomic single-use consume: two concurrent requests with the same token
  // cannot both pass (the WHERE re-checks usedAt/expiry at the row level).
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.portalAuthToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw new Error('TOKEN_INVALID_OR_EXPIRED');
    await tx.portalAccount.update({
      where: { id: account.id },
      // Phase 10.4: a password setup/reset revokes any outstanding session
      // for this account (sessionVersion bump) — someone who set up the
      // account or reset the password should not automatically stay signed
      // in with a session that predates the new password.
      data: {
        passwordHash: hashPassword(newPassword),
        failedLoginAttempts: 0,
        lockedUntil: null,
        sessionVersion: { increment: 1 },
      },
    });
  });

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

/**
 * Changes the password and revokes every outstanding session for this
 * account (Phase 10.4), including the caller's own current cookie — the
 * route re-issues a fresh one from the returned `sessionVersion` so the
 * caller's own device stays signed in while any other copy of the old
 * token stops working immediately.
 */
export async function changePassword(
  session: PortalSessionUser,
  currentPassword: string,
  newPassword: string
): Promise<{ sessionVersion: number }> {
  const account = await prisma.portalAccount.findUnique({ where: { id: session.portalAccountId } });
  if (!account || !account.passwordHash) throw new Error('PORTAL_PASSWORD_NOT_SET');
  if (!verifyPassword(currentPassword, account.passwordHash)) throw new Error('PORTAL_INVALID_CREDENTIALS');

  const updated = await prisma.portalAccount.update({
    where: { id: account.id },
    data: { passwordHash: hashPassword(newPassword), sessionVersion: { increment: 1 } },
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

  return { sessionVersion: updated.sessionVersion };
}

/** Bumps sessionVersion only — used by logout to revoke every outstanding token for this account. */
export async function bumpPortalAccountSessionVersion(portalAccountId: string): Promise<void> {
  await prisma.portalAccount.update({
    where: { id: portalAccountId },
    data: { sessionVersion: { increment: 1 } },
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

  // Phase 10.4: any status change revokes every outstanding session for
  // this account — disabling must take effect immediately, and
  // re-enabling should not silently resurrect a token from before it was
  // disabled.
  await prisma.$transaction(async (tx) => {
    // Phase 11.4: re-enabling a disabled portal account takes a slot again.
    if (status === 'ACTIVE' && account.status !== 'ACTIVE') await checkPortalAccountLimit(tx, coachingCenterId);
    await tx.portalAccount.update({
      where: { id: account.id },
      data:
        status === 'ACTIVE'
          ? { status, failedLoginAttempts: 0, lockedUntil: null, sessionVersion: { increment: 1 } }
          : { status, sessionVersion: { increment: 1 } },
    });
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

import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import type { PortalSessionUser } from '@/lib/auth/portal-session';
import type { PlatformSessionUser } from '@/lib/auth/platform-session';
import { staffIdentityInclude, toStaffIdentity, type StaffIdentity } from './user.service';
import { portalIdentityInclude, toPortalSessionUser } from './portal-auth.service';
import { recordAuditLog } from './audit.service';
import { recordPlatformAudit } from './platform-audit.service';

/**
 * The single sign-in path for the whole application (/login → /api/auth/login).
 *
 * Email + password only. The server decides which identity the credentials
 * belong to — platform super admin (PlatformAdmin), staff (User: OWNER/ADMIN/STAFF/TEACHER),
 * or portal (PortalAccount: STUDENT/GUARDIAN) — the user never picks an account type.
 *
 * Security properties:
 *  - every platform admin, staff user AND portal account with the email is considered;
 *    exactly ONE password match authenticates. Zero matches or several (same email + same
 *    password across multiple identities) → generic failure, never an arbitrary pick;
 *  - account state (inactive/disabled) is revealed only after the correct
 *    password, so it cannot be probed without the password;
 *  - lockout: MAX_FAILED_ATTEMPTS consecutive failures lock an account for
 *    LOCKOUT_MINUTES. A locked account's password is not even checked;
 *  - an unknown email still costs one scrypt verification (timing parity).
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
const CANDIDATE_LIMIT = 10;

// A valid salt:hash of a random secret, verified against when no account
// matches so "unknown email" costs the same scrypt time as "wrong password".
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

export type AuthOutcome =
  | { ok: true; kind: 'PLATFORM_ADMIN'; admin: PlatformSessionUser }
  | { ok: true; kind: 'STAFF'; staff: StaffIdentity }
  | { ok: true; kind: 'PORTAL'; portal: PortalSessionUser; portalAccountId: string }
  | { ok: false; reason: 'INVALID_CREDENTIALS' }
  // Only returned when the password was correct for exactly one account.
  | { ok: false; reason: 'ACCOUNT_INACTIVE' }
  // Phase 11.4: correct password, but the coaching center is suspended by the platform.
  | { ok: false; reason: 'TENANT_SUSPENDED' };

interface LockState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

function isLocked(a: LockState, now: number): boolean {
  return !!a.lockedUntil && a.lockedUntil.getTime() > now;
}

/** Next lock state after a failure. An expired lock starts a fresh count. */
function nextFailure(a: LockState, now: number): { failedLoginAttempts: number; lockedUntil: Date | null } {
  const base = a.lockedUntil && a.lockedUntil.getTime() <= now ? 0 : a.failedLoginAttempts;
  const failedLoginAttempts = base + 1;
  const lockedUntil = failedLoginAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now + LOCKOUT_MINUTES * 60 * 1000) : null;
  return { failedLoginAttempts, lockedUntil };
}

export function redirectPathFor(outcome: Extract<AuthOutcome, { ok: true }>): string {
  if (outcome.kind === 'PLATFORM_ADMIN') return '/super-admin/dashboard';
  if (outcome.kind === 'PORTAL') return outcome.portal.portalType === 'GUARDIAN' ? '/portal/guardian' : '/portal/student';
  // OWNER / ADMIN / STAFF / TEACHER share the staff dashboard; TEACHER's
  // navigation and data access are narrowed by the existing role guards.
  return '/dashboard';
}

import { normalizeBdPhone } from '@/lib/validations/student';

export async function authenticateByEmail(rawIdentifier: string, plainPassword: string, ipAddress?: string | null): Promise<AuthOutcome> {
  const identifier = rawIdentifier.trim();
  if (!identifier || !plainPassword) return { ok: false, reason: 'INVALID_CREDENTIALS' };

  let platformAdmin: any = null;
  let users: any[] = [];
  let portals: any[] = [];

  // Step 1: Check Email candidates (matching order: Email -> Phone -> Student ID)
  if (identifier.includes('@')) {
    const email = identifier.toLowerCase();
    [platformAdmin, users, portals] = await Promise.all([
      prisma.platformAdmin.findUnique({
        where: { email },
      }),
      prisma.user.findMany({
        where: { email: { equals: email, mode: 'insensitive' } },
        include: staffIdentityInclude,
        take: CANDIDATE_LIMIT,
      }),
      prisma.portalAccount.findMany({
        where: { email: { equals: email, mode: 'insensitive' } },
        include: portalIdentityInclude,
        take: CANDIDATE_LIMIT,
      }),
    ]);
  }

  // Step 2: Check Phone candidates if no email matches found
  if (!platformAdmin && users.length === 0 && portals.length === 0) {
    const cleanedDigits = identifier.replace(/[\s-]/g, '');
    const normalized = normalizeBdPhone(identifier);
    const isPhoneLike = /^\+?\d{7,15}$/.test(cleanedDigits);

    if (isPhoneLike) {
      const phoneCandidates = Array.from(new Set([identifier, cleanedDigits, normalized].filter(Boolean)));
      [users, portals] = await Promise.all([
        prisma.user.findMany({
          where: {
            phone: { in: phoneCandidates },
          },
          include: staffIdentityInclude,
          take: CANDIDATE_LIMIT,
        }),
        prisma.portalAccount.findMany({
          where: {
            OR: [
              { phone: { in: phoneCandidates } },
              { student: { phone: { in: phoneCandidates } } },
              { guardian: { phone: { in: phoneCandidates } } },
            ],
          },
          include: portalIdentityInclude,
          take: CANDIDATE_LIMIT,
        }),
      ]);
    }
  }

  // Step 3: Check Student ID Code candidates if no email or phone matches found
  if (!platformAdmin && users.length === 0 && portals.length === 0) {
    const studentMatches = await prisma.student.findMany({
      where: {
        studentIdCode: { equals: identifier, mode: 'insensitive' },
      },
      select: { id: true, coachingCenterId: true },
      take: CANDIDATE_LIMIT,
    });

    if (studentMatches.length > 0) {
      portals = await prisma.portalAccount.findMany({
        where: {
          studentId: { in: studentMatches.map((s) => s.id) },
        },
        include: portalIdentityInclude,
        take: CANDIDATE_LIMIT,
      });
    }
  }

  const now = Date.now();
  if (!platformAdmin && users.length === 0 && portals.length === 0) {
    verifyPassword(plainPassword, DUMMY_HASH);
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  const platformAdminToCheck = platformAdmin && !isLocked(platformAdmin, now) ? platformAdmin : null;
  const usersToCheck = users.filter((u) => !isLocked(u, now));
  const portalsToCheck = portals.filter((p) => !isLocked(p, now) && p.passwordHash);
  if (!platformAdminToCheck && usersToCheck.length === 0 && portalsToCheck.length === 0) {
    verifyPassword(plainPassword, DUMMY_HASH);
  }

  const platformMatches = (platformAdminToCheck && verifyPassword(plainPassword, platformAdminToCheck.passwordHash))
    ? [platformAdminToCheck]
    : [];
  const userMatches = usersToCheck.filter((u) => verifyPassword(plainPassword, u.passwordHash));
  const portalMatches = portalsToCheck.filter((p) => verifyPassword(plainPassword, p.passwordHash as string));
  const matchCount = platformMatches.length + userMatches.length + portalMatches.length;

  if (matchCount === 0) {
    await Promise.all([
      ...(platformAdminToCheck ? [
        (async () => {
          const next = nextFailure(platformAdminToCheck, now);
          await prisma.platformAdmin.update({ where: { id: platformAdminToCheck.id }, data: next });
          if (next.lockedUntil) {
            await recordPlatformAudit({
              adminId: platformAdminToCheck.id,
              action: 'PLATFORM_LOGIN_LOCKED',
              entity: 'PlatformAdmin',
              entityId: platformAdminToCheck.id,
              details: { attempts: next.failedLoginAttempts },
              ipAddress,
            });
          }
        })(),
      ] : []),
      ...usersToCheck.map(async (u) => {
        const next = nextFailure(u, now);
        await prisma.user.update({ where: { id: u.id }, data: next });
        if (next.lockedUntil) {
          await recordAuditLog({ coachingCenterId: u.coachingCenterId, userId: u.id, action: 'USER_LOGIN_LOCKED', entity: 'User', entityId: u.id, details: { attempts: next.failedLoginAttempts } });
        }
      }),
      ...portalsToCheck.map(async (p) => {
        const next = nextFailure(p, now);
        await prisma.portalAccount.update({ where: { id: p.id }, data: next });
        if (next.lockedUntil) {
          await recordAuditLog({ coachingCenterId: p.coachingCenterId, studentId: p.studentId, guardianId: p.guardianId, action: 'PORTAL_ACCOUNT_LOCKED', entity: 'PortalAccount', entityId: p.id, details: { attempts: next.failedLoginAttempts } });
        }
      }),
    ]);
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  if (matchCount > 1) {
    // Same email + same password on more than one account: the credentials do
    // not identify a single account, so none is chosen.
    console.warn('[auth] Ambiguous sign-in: email + password match more than one account');
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  if (platformMatches.length === 1) {
    const admin = platformMatches[0];
    if (admin.status !== 'ACTIVE') return { ok: false, reason: 'ACCOUNT_INACTIVE' };
    const updated = await prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await recordPlatformAudit({
      adminId: admin.id,
      action: 'PLATFORM_LOGIN',
      entity: 'PlatformAdmin',
      entityId: admin.id,
      ipAddress,
    });
    return {
      ok: true,
      kind: 'PLATFORM_ADMIN',
      admin: {
        adminId: updated.id,
        email: updated.email,
        name: updated.name,
        sessionVersion: updated.sessionVersion,
      },
    };
  }

  if (userMatches.length === 1) {
    const user = userMatches[0];
    if (user.status !== 'ACTIVE') return { ok: false, reason: 'ACCOUNT_INACTIVE' };
    if (user.coachingCenter.status === 'SUSPENDED') return { ok: false, reason: 'TENANT_SUSPENDED' };
    const identity = toStaffIdentity(user);
    if (!identity) return { ok: false, reason: 'INVALID_CREDENTIALS' };
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
    return { ok: true, kind: 'STAFF', staff: identity };
  }

  const account = portalMatches[0];
  if (account.status !== 'ACTIVE') return { ok: false, reason: 'ACCOUNT_INACTIVE' };
  if (account.coachingCenter.status === 'SUSPENDED') return { ok: false, reason: 'TENANT_SUSPENDED' };
  const linked = account.portalType === 'STUDENT' ? account.student : account.guardian;
  if (!linked) return { ok: false, reason: 'INVALID_CREDENTIALS' };
  await prisma.portalAccount.update({ where: { id: account.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
  return { ok: true, kind: 'PORTAL', portal: toPortalSessionUser(account), portalAccountId: account.id };
}

export const authenticateUser = authenticateByEmail;


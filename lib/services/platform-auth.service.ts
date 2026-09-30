import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import type { PlatformSessionUser } from '@/lib/auth/platform-session';
import { recordPlatformAudit } from './platform-audit.service';

/**
 * Super Admin sign-in. Platform admins are a separate table from tenant users,
 * so this can never authenticate (or be reached by) a tenant OWNER/ADMIN/STAFF/
 * TEACHER, and a tenant login can never produce a platform session.
 *
 * Same hardening as tenant sign-in: uniform failure, timing parity for unknown
 * emails, and 5 consecutive failures lock the account for 15 minutes.
 */
export const PLATFORM_MAX_FAILED_ATTEMPTS = 5;
export const PLATFORM_LOCKOUT_MINUTES = 15;

const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

export type PlatformAuthOutcome = { ok: true; admin: PlatformSessionUser } | { ok: false };

export async function authenticatePlatformAdmin(rawEmail: string, plainPassword: string, ipAddress?: string | null): Promise<PlatformAuthOutcome> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !plainPassword) return { ok: false };

  const admin = await prisma.platformAdmin.findUnique({ where: { email } });
  const now = Date.now();
  const locked = !!admin?.lockedUntil && admin.lockedUntil.getTime() > now;

  if (!admin || admin.status !== 'ACTIVE' || locked) {
    verifyPassword(plainPassword, DUMMY_HASH);
    return { ok: false };
  }

  if (!verifyPassword(plainPassword, admin.passwordHash)) {
    const base = admin.lockedUntil && admin.lockedUntil.getTime() <= now ? 0 : admin.failedLoginAttempts;
    const failed = base + 1;
    const lockedUntil = failed >= PLATFORM_MAX_FAILED_ATTEMPTS ? new Date(now + PLATFORM_LOCKOUT_MINUTES * 60 * 1000) : null;
    await prisma.platformAdmin.update({ where: { id: admin.id }, data: { failedLoginAttempts: failed, lockedUntil } });
    if (lockedUntil) {
      await recordPlatformAudit({ adminId: admin.id, action: 'PLATFORM_LOGIN_LOCKED', entity: 'PlatformAdmin', entityId: admin.id, details: { attempts: failed }, ipAddress });
    }
    return { ok: false };
  }

  const updated = await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await recordPlatformAudit({ adminId: admin.id, action: 'PLATFORM_LOGIN', entity: 'PlatformAdmin', entityId: admin.id, ipAddress });
  return { ok: true, admin: { adminId: updated.id, email: updated.email, name: updated.name, sessionVersion: updated.sessionVersion } };
}

/** Bumps sessionVersion so every outstanding platform token stops working (used by logout). */
export async function revokePlatformSessions(adminId: string): Promise<void> {
  await prisma.platformAdmin.update({ where: { id: adminId }, data: { sessionVersion: { increment: 1 } } });
}

/** Used by the provisioning script and tests. Requires a strong password; never logs it. */
export async function createPlatformAdmin(input: { email: string; name: string; password: string }) {
  if (input.password.length < 12) throw new Error('PLATFORM_PASSWORD_TOO_WEAK: use at least 12 characters');
  const email = input.email.trim().toLowerCase();
  const admin = await prisma.platformAdmin.create({ data: { email, name: input.name.trim(), passwordHash: hashPassword(input.password) } });
  await recordPlatformAudit({ adminId: admin.id, action: 'PLATFORM_ADMIN_CREATED', entity: 'PlatformAdmin', entityId: admin.id, details: { email } });
  return { id: admin.id, email: admin.email, name: admin.name };
}

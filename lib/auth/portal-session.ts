import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import prisma from '@/lib/db';
import { getPortalSecretKey } from './secret';
import { portalIdentityInclude, toPortalSessionUser } from '@/lib/services/portal-auth.service';

/**
 * Portal (Student/Guardian) session — deliberately separate from staff auth
 * (lib/auth/session.ts): a distinct cookie name, a distinct `type: 'portal'`
 * claim, AND (Phase 10.4) a signing key cryptographically independent from
 * the staff key (see lib/auth/secret.ts) — a portal token cannot verify
 * against the staff key, or vice versa, even if a caller forgot to check the
 * `type` claim.
 */
export const PORTAL_SESSION_COOKIE_NAME = 'coaching_os_portal_session';

export type PortalType = 'STUDENT' | 'GUARDIAN';

export interface PortalSessionUser {
  portalAccountId: string;
  portalType: PortalType;
  studentId?: string | null;
  guardianId?: string | null;
  coachingCenterId: string;
  name: string;
  /** Phase 10.4: must match PortalAccount.sessionVersion for the session to remain valid. */
  sessionVersion: number;
}

interface PortalTokenPayload {
  type: 'portal';
  sub: string; // portalAccountId
  sessionVersion: number;
}

function isPortalTokenPayload(payload: unknown): payload is PortalTokenPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return p.type === 'portal' && typeof p.sub === 'string' && typeof p.sessionVersion === 'number';
}

/**
 * The token only asserts "this is portal account <sub>, as of session
 * version <n>" — portalType, studentId/guardianId, coachingCenterId and name
 * are never trusted from the token itself; every verification re-reads them
 * from the database (see `verifyPortalSessionToken`).
 */
export async function createPortalSessionToken(user: Pick<PortalSessionUser, 'portalAccountId' | 'sessionVersion'>): Promise<string> {
  const payload: PortalTokenPayload = { type: 'portal', sub: user.portalAccountId, sessionVersion: user.sessionVersion };
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getPortalSecretKey());
}

/**
 * Verify a portal JWT and re-derive the session identity from the database.
 * Rejects (returns null) for a bad/foreign-audience signature, a missing or
 * wrong `type` claim, an account that no longer exists or is DISABLED, or a
 * `sessionVersion` that no longer matches the current DB value (logout,
 * password change/reset/setup, or a status change since the token was
 * issued).
 */
export async function verifyPortalSessionToken(token: string): Promise<PortalSessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getPortalSecretKey());
    if (!isPortalTokenPayload(payload)) return null;

    const account = await prisma.portalAccount.findUnique({
      where: { id: payload.sub },
      include: portalIdentityInclude,
    });
    if (!account) return null;
    if (account.status !== 'ACTIVE') return null;
    if (account.coachingCenter.status === 'SUSPENDED') return null;
    if (account.sessionVersion !== payload.sessionVersion) return null;

    return toPortalSessionUser(account);
  } catch {
    return null;
  }
}

export async function getPortalSession(): Promise<PortalSessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return await verifyPortalSessionToken(token);
  } catch {
    return null;
  }
}

export async function setPortalSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PORTAL_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function clearPortalSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PORTAL_SESSION_COOKIE_NAME);
}

export async function requirePortalAuth(): Promise<PortalSessionUser> {
  const session = await getPortalSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

export async function requireStudentPortal(): Promise<PortalSessionUser> {
  const session = await requirePortalAuth();
  if (session.portalType !== 'STUDENT' || !session.studentId) throw new Error('FORBIDDEN_PORTAL_TYPE');
  return session;
}

export async function requireGuardianPortal(): Promise<PortalSessionUser> {
  const session = await requirePortalAuth();
  if (session.portalType !== 'GUARDIAN' || !session.guardianId) throw new Error('FORBIDDEN_PORTAL_TYPE');
  return session;
}

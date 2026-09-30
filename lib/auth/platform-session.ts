import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import prisma from '@/lib/db';
import { getPlatformSecretKey } from './secret';

/**
 * Platform (Super Admin) session — a third, fully separate authentication
 * boundary next to staff (coaching_os_session) and portal
 * (coaching_os_portal_session): its own cookie, its own `type: 'platform'`
 * claim and its own signing key (see lib/auth/secret.ts).
 *
 * The token asserts only "platform admin <sub>, session version <n>". Status,
 * name and everything else are re-read from the database on every request;
 * nothing about tenants, plans or limits is ever placed in the token.
 * Lifetime is deliberately short (8 hours) compared with tenant sessions.
 */
export const PLATFORM_SESSION_COOKIE_NAME = 'coaching_os_platform_session';
const PLATFORM_SESSION_SECONDS = 8 * 60 * 60;

export interface PlatformSessionUser {
  adminId: string;
  email: string;
  name: string;
  sessionVersion: number;
}

interface PlatformTokenPayload {
  type: 'platform';
  sub: string;
  sessionVersion: number;
}

function isPlatformTokenPayload(payload: unknown): payload is PlatformTokenPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return p.type === 'platform' && typeof p.sub === 'string' && typeof p.sessionVersion === 'number';
}

export async function createPlatformSessionToken(admin: Pick<PlatformSessionUser, 'adminId' | 'sessionVersion'>): Promise<string> {
  const payload: PlatformTokenPayload = { type: 'platform', sub: admin.adminId, sessionVersion: admin.sessionVersion };
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${PLATFORM_SESSION_SECONDS}s`)
    .sign(getPlatformSecretKey());
}

export async function verifyPlatformSessionToken(token: string): Promise<PlatformSessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getPlatformSecretKey());
    if (!isPlatformTokenPayload(payload)) return null;
    const admin = await prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
    if (!admin || admin.status !== 'ACTIVE') return null;
    if (admin.sessionVersion !== payload.sessionVersion) return null;
    return { adminId: admin.id, email: admin.email, name: admin.name, sessionVersion: admin.sessionVersion };
  } catch {
    return null;
  }
}

export async function getPlatformSession(): Promise<PlatformSessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(PLATFORM_SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return await verifyPlatformSessionToken(token);
  } catch {
    return null;
  }
}

export async function setPlatformSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(PLATFORM_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: PLATFORM_SESSION_SECONDS,
  });
}

export async function clearPlatformSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(PLATFORM_SESSION_COOKIE_NAME);
}

/**
 * Guard for every /api/super-admin/* handler. It verifies the PLATFORM session
 * only — a tenant staff or portal cookie is never consulted, so no tenant role
 * (not even OWNER) can pass it, and this is not a RoleCode check.
 */
export async function requireSuperAdmin(): Promise<PlatformSessionUser> {
  const session = await getPlatformSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

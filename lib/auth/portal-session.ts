import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

/**
 * Portal (Student/Guardian) session — deliberately separate from staff
 * auth (lib/auth/session.ts). Distinct cookie name + a `portalType` field
 * that never appears on a staff JWT means a staff session can never be
 * misread as a portal session or vice versa, without needing a second
 * signing secret.
 */
export const PORTAL_SESSION_COOKIE_NAME = 'coaching_os_portal_session';
const SECRET_KEY = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'coaching-os-bangladesh-production-secret-key-32chars'
);

export type PortalType = 'STUDENT' | 'GUARDIAN';

export interface PortalSessionUser {
  portalAccountId: string;
  portalType: PortalType;
  studentId?: string | null;
  guardianId?: string | null;
  coachingCenterId: string;
  name: string;
}

export async function createPortalSessionToken(user: PortalSessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET_KEY);
}

export async function verifyPortalSessionToken(token: string): Promise<PortalSessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    if (payload.portalType !== 'STUDENT' && payload.portalType !== 'GUARDIAN') return null;
    return payload as unknown as PortalSessionUser;
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

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { RoleCode } from '@prisma/client';

export const SESSION_COOKIE_NAME = 'coaching_os_session';
const SECRET_KEY = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'coaching-os-bangladesh-production-secret-key-32chars'
);

export interface SessionUser {
  userId: string;
  email: string;
  phone?: string | null;
  name: string;
  banglaName?: string | null;
  role: RoleCode;
  coachingCenterId: string;
  branchId?: string | null;
}

/**
 * Sign a JWT token for a session
 */
export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET_KEY);
}

/**
 * Verify a JWT session token
 */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

/**
 * Get the current authenticated user session from HTTP cookies
 */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

/**
 * Set the session cookie
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * Clear the session cookie
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Guard: Require authenticated user or throw/redirect
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error('UNAUTHORIZED');
  }
  return session;
}

/**
 * Guard: Resolve coachingCenterId strictly from authenticated session
 */
export async function requireTenant(): Promise<{
  coachingCenterId: string;
  branchId?: string | null;
  user: SessionUser;
}> {
  const user = await requireAuth();
  if (!user.coachingCenterId) {
    throw new Error('TENANT_NOT_FOUND');
  }
  return {
    coachingCenterId: user.coachingCenterId,
    branchId: user.branchId,
    user,
  };
}

/**
 * Guard: Require one of the specified roles
 */
export async function requireRole(allowedRoles: RoleCode[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new Error('FORBIDDEN');
  }
  return user;
}

/**
 * Guard: A user scoped to a single branch (non OWNER/ADMIN with a branchId)
 * may only operate on that branch. OWNER/ADMIN have center-wide access.
 */
export function assertBranchAccess(user: SessionUser, branchId: string | null | undefined): void {
  if (user.role === 'OWNER' || user.role === 'ADMIN') return;
  if (user.branchId && branchId && user.branchId !== branchId) {
    throw new Error('FORBIDDEN_BRANCH');
  }
}

/**
 * Resolves the branch a listing/read endpoint should actually be scoped to:
 * a branch-scoped STAFF/TEACHER always gets their own branch, regardless of
 * what the client requested — the client-supplied branchId is only honored
 * for center-wide OWNER/ADMIN callers (or a TEACHER/STAFF with no fixed
 * branch). This prevents a branch-scoped user from reading another
 * branch's attendance just by editing the query string.
 */
export function resolveEffectiveBranchId(user: SessionUser, requestedBranchId?: string): string | undefined {
  if (user.role !== 'OWNER' && user.role !== 'ADMIN' && user.branchId) {
    return user.branchId;
  }
  return requestedBranchId;
}

/**
 * Guard: a TEACHER may only act on their own attendance sessions/classes.
 * OWNER/ADMIN/STAFF retain administrative access to everyone's.
 * `ownTeacherId` is the Teacher record linked to the caller's User (or null
 * if the caller has no teacher profile), resolved by the route beforehand.
 */
export function assertTeacherSelfAccess(
  user: SessionUser,
  resourceTeacherId: string | null | undefined,
  ownTeacherId: string | null
): void {
  if (user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'STAFF') return;
  if (user.role === 'TEACHER') {
    if (!ownTeacherId || !resourceTeacherId || resourceTeacherId !== ownTeacherId) {
      throw new Error('FORBIDDEN_TEACHER_SCOPE');
    }
    return;
  }
}

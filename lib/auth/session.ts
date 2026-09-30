import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { RoleCode } from '@prisma/client';
import prisma from '@/lib/db';
import { getStaffSecretKey } from './secret';
import { staffIdentityInclude, toStaffIdentity, type StaffIdentity } from '@/lib/services/user.service';

export const SESSION_COOKIE_NAME = 'coaching_os_session';

/**
 * Phase 10.4: `SessionUser` IS `StaffIdentity` (lib/services/user.service.ts)
 * — one definition, so the shape returned by a fresh DB read and the shape
 * every route/service already imports as `SessionUser` can never drift
 * apart.
 */
export type SessionUser = StaffIdentity;

interface StaffTokenPayload {
  type: 'staff';
  sub: string; // userId
  sessionVersion: number;
}

function isStaffTokenPayload(payload: unknown): payload is StaffTokenPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return p.type === 'staff' && typeof p.sub === 'string' && typeof p.sessionVersion === 'number';
}

/**
 * Sign a JWT token for a staff session. The token itself only asserts
 * "this is user <sub>, as of session version <n>" — nothing else about the
 * account (role, tenant, branch, status) is trusted from the token. Every
 * verification re-reads all of that from the database (see
 * `verifySessionToken`), so a role/branch/status change, or a password
 * change/logout (which bumps sessionVersion), takes effect on the very next
 * request instead of waiting out the token's 7-day expiry.
 */
export async function createSessionToken(user: Pick<SessionUser, 'userId' | 'sessionVersion'>): Promise<string> {
  const payload: StaffTokenPayload = { type: 'staff', sub: user.userId, sessionVersion: user.sessionVersion };
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getStaffSecretKey());
}

/**
 * Verify a staff JWT and re-derive the session identity from the database.
 * Rejects (returns null) when:
 *  - the signature/expiry is invalid, or it was signed for the portal
 *    audience instead (different derived key — see lib/auth/secret.ts);
 *  - the `type` claim is missing/not exactly "staff" (no default-role /
 *    default-allow fallback for a malformed or foreign token);
 *  - the user no longer exists, is not ACTIVE, or has no role assignment
 *    (`toStaffIdentity` already enforces both — default deny, not default
 *    STAFF as an earlier version of this function did);
 *  - the token's `sessionVersion` doesn't match the current DB value, i.e.
 *    the account logged out, changed its password, or was disabled/
 *    re-enabled since this token was issued.
 */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getStaffSecretKey());
    if (!isStaffTokenPayload(payload)) return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: staffIdentityInclude,
    });
    if (!user) return null;
    if (user.sessionVersion !== payload.sessionVersion) return null;

    return toStaffIdentity(user);
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
 * Guard: Asserts that a user has authorization to operate on a branch-scoped resource.
 *
 * Safe Null-Branch Policy (Phase 11.1):
 * 1. Center-wide roles:
 *    - OWNER always has full center-wide access across all branches and tenant-wide (null-branch) resources.
 *    - Unassigned users (!user.branchId, e.g. center-wide ADMIN, STAFF, or TEACHER without a fixed branch assignment)
 *      have center-wide access across all branches and tenant-wide resources.
 * 2. Branch-locked roles (user.branchId is set, e.g. branch-locked ADMIN, STAFF, or TEACHER):
 *    - When resource branchId != null: user.branchId must strictly match resource branchId.
 *    - When resource branchId == null (or undefined): Access is FORBIDDEN. Tenant-wide or unassigned
 *      resources belong to the center as a whole and may only be operated on by center-wide roles,
 *      never by users restricted to a specific branch.
 */
export function assertBranchAccess(user: SessionUser, branchId: string | null | undefined): void {
  if (user.role === 'OWNER') return;
  if (!user.branchId) return;

  if (!branchId || user.branchId !== branchId) {
    throw new Error('FORBIDDEN_BRANCH');
  }
}

/**
 * Resolves the branch a listing/read endpoint should actually be scoped to:
 * a branch-scoped caller (anyone with a fixed user.branchId, other than OWNER)
 * always gets their own branch, regardless of what the client requested.
 * The client-supplied branchId is only honored for center-wide callers
 * (OWNER, or users with no fixed branch).
 */
export function resolveEffectiveBranchId(user: SessionUser, requestedBranchId?: string): string | undefined {
  if (user.role !== 'OWNER' && user.branchId) {
    return user.branchId;
  }
  return requestedBranchId;
}

/**
 * Guard: a TEACHER may only act on their own attendance sessions/classes.
 * OWNER/ADMIN/STAFF retain administrative access to everyone's.
 * `ownTeacherId` is the Teacher record linked to the caller's User (or null
 * if the caller has no teacher profile), resolved by the route beforehand.
 *
 * Default-deny: any role outside the four known ones falls through to the
 * final throw rather than silently succeeding.
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
  throw new Error('FORBIDDEN');
}

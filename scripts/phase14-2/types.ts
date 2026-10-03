import type { RoleCode } from '@prisma/client';
import type { PermissionCode } from '../../lib/auth/permissions';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * One migrated route handler (or service-gated action).
 *
 * `oldRoles` is the EFFECTIVE set of roles allowed BEFORE Phase 14.2 (route
 * gate and service gate combined). 'ANY' means any authenticated staff user.
 *
 * `permissions` are ALL required (AND). `null` = intentionally no permission
 * gate (shared reference data, per-user data) — say why in `note`.
 *
 * `residualDeny` lists roles still refused by a retained role-based SCOPE
 * check (e.g. "a TEACHER may only act on their own record"); parity is
 * computed as:  permissions satisfied by the role's DEFAULT set  AND  role not in residualDeny.
 *
 * `ownerOnlyRole: true` marks a deliberately retained requireRole(['OWNER'])
 * (immutable Owner rule that is not in the permission catalog).
 */
export interface RouteAuthEntry {
  route: string;
  method: HttpMethod;
  oldRoles: RoleCode[] | 'ANY';
  permissions: PermissionCode[] | null;
  residualDeny?: RoleCode[];
  /**
   * Roles admitted through an own-record path in the service (e.g. a TEACHER
   * reading their OWN salary history) regardless of the permission.
   */
  selfAllowedRoles?: RoleCode[];
  ownerOnlyRole?: boolean;
  note?: string;
}

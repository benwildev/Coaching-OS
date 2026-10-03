import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getTenantRolePermissions } from '@/lib/services/permission.service';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * Phase 14.1 — Owner-only. Granted permission codes per configurable role for
 * the caller's own tenant, plus the baseline each role resets to. The catalog
 * itself (labels, grouping) is static and imported by the UI directly from
 * lib/auth/permissions.ts. Codes only — no database ids.
 */
export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    await requireRole(['OWNER']);

    const roles = await getTenantRolePermissions(coachingCenterId);
    return NextResponse.json({
      success: true,
      roles,
      defaults: { ADMIN: DEFAULT_ROLE_PERMISSIONS.ADMIN, STAFF: DEFAULT_ROLE_PERMISSIONS.STAFF, TEACHER: DEFAULT_ROLE_PERMISSIONS.TEACHER },
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/roles-permissions GET');
  }
}

import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { updateRolePermissions } from '@/lib/services/permission.service';

export const dynamic = 'force-dynamic';

/**
 * Phase 14.1 — Owner-only. Replaces one role's permission set (diffed and
 * applied atomically). The role is resolved from the session's tenant by its
 * code; the client never supplies a role id or tenant id.
 */
export async function PUT(request: Request, props: { params: Promise<{ role: string }> }) {
  try {
    const { user } = await requireTenant();
    await requireRole(['OWNER']);
    const { role } = await props.params;

    const body = await request.json().catch(() => null);
    const result = await updateRolePermissions(user, role.toUpperCase(), body?.permissions, {
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/roles-permissions/[role] PUT');
  }
}

import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { resetRolePermissions } from '@/lib/services/permission.service';

export const dynamic = 'force-dynamic';

/** Phase 14.1 — Owner-only. Restores one role to the Phase 14.1 baseline permission set. */
export async function POST(request: Request, props: { params: Promise<{ role: string }> }) {
  try {
    const { user } = await requireTenant();
    await requireRole(['OWNER']);
    const { role } = await props.params;

    const result = await resetRolePermissions(user, role.toUpperCase(), {
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/roles-permissions/[role]/reset POST');
  }
}

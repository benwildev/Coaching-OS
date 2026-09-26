import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { getPortalAccountStatus, staffProvisionPortalAccount } from '@/lib/services/portal-auth.service';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);
    const sp = new URL(request.url).searchParams;
    const studentId = sp.get('studentId') || undefined;
    const guardianId = sp.get('guardianId') || undefined;
    if (!studentId && !guardianId) {
      return NextResponse.json({ success: false, error: 'IDENTITY_REQUIRED', message: 'studentId or guardianId is required' }, { status: 400 });
    }
    const account = await getPortalAccountStatus(coachingCenterId, { studentId, guardianId });
    return NextResponse.json({ success: true, account });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal-accounts GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);
    const body = await request.json().catch(() => null);
    const studentId: string | undefined = body?.studentId || undefined;
    const guardianId: string | undefined = body?.guardianId || undefined;
    if ((!studentId && !guardianId) || (studentId && guardianId)) {
      return NextResponse.json({ success: false, error: 'INVALID_PORTAL_IDENTITY', message: 'Exactly one of studentId or guardianId is required' }, { status: 400 });
    }

    const result = await staffProvisionPortalAccount(coachingCenterId, user.userId, { studentId, guardianId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal-accounts POST');
  }
}

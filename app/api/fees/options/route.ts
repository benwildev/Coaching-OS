import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getFeeFormOptions } from '@/lib/services/fee.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const branchId = resolveEffectiveBranchId(user);
    const options = await getFeeFormOptions(coachingCenterId, branchId);
    return NextResponse.json({ success: true, ...options });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/options GET');
  }
}

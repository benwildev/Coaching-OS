import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getManualSubmissions } from '@/lib/services/payment-gateway.service';
import { ManualPaymentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { coachingCenterId, branchId: userBranchId, user } = await requireTenant();
    await requirePermission('fees.read');

    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status') as ManualPaymentStatus | null;
    const branchParam = url.searchParams.get('branchId');

    // Strict branch isolation: non-OWNER staff cannot see submissions of other branches if they are branch-bound
    const effectiveBranchId = user.role === 'OWNER' ? branchParam || undefined : userBranchId || branchParam || undefined;

    const submissions = await getManualSubmissions(coachingCenterId, {
      status: statusParam && Object.values(ManualPaymentStatus).includes(statusParam) ? statusParam : undefined,
      branchId: effectiveBranchId,
    });

    return NextResponse.json({ success: true, submissions });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/manual-submissions GET');
  }
}

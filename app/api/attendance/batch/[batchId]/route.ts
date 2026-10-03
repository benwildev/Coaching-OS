import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getBatchAttendanceSummary } from '@/lib/services/attendance.service';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('attendance.read');
    const { batchId } = await props.params;

    const batch = await prisma.batch.findFirst({ where: { id: batchId, coachingCenterId }, select: { branchId: true } });
    if (!batch) return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    assertBranchAccess(user, batch.branchId);

    const summary = await getBatchAttendanceSummary(coachingCenterId, batchId);
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    return apiErrorResponse(error, '/api/attendance/batch/[batchId] GET');
  }
}

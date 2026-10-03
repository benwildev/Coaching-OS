import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getBatchPerformanceStats } from '@/lib/services/exam-result.service';
import { getTeacherByUserId } from '@/lib/services/teacher.service';

export const dynamic = 'force-dynamic';

/**
 * Staff batch performance aggregate (batch detail page). The batch must be
 * in the caller's tenant and branch; a TEACHER must hold an ACTIVE
 * assignment on this batch (aggregate figures only — no per-student rows).
 */
export async function GET(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('results.read');
    const { batchId } = await params;

    const batch = await prisma.batch.findFirst({
      where: { id: batchId, coachingCenterId },
      select: { id: true, branchId: true },
    });
    if (!batch) throw new Error('BATCH_NOT_FOUND');
    assertBranchAccess(user, batch.branchId);

    if (user.role === 'TEACHER') {
      const teacher = await getTeacherByUserId(coachingCenterId, user.userId);
      const assigned = teacher
        ? await prisma.batchTeacherAssignment.count({
            where: { coachingCenterId, teacherId: teacher.id, batchId: batch.id, status: 'ACTIVE' },
          })
        : 0;
      if (!assigned) throw new Error('FORBIDDEN_TEACHER_SCOPE');
    }

    const stats = await getBatchPerformanceStats(coachingCenterId, batch.id);
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    return apiErrorResponse(error, 'GET /api/results/batch/[batchId]');
  }
}

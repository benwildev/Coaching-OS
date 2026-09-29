import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getExamPublishStatus } from '@/lib/services/exam-result.service';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { examId } = await params;

    // Phase 10.5: previously no branch check — a branch-locked STAFF could
    // check publish status of any branch's exam.
    const existing = await prisma.exam.findFirst({ where: { id: examId, coachingCenterId }, select: { branchId: true } });
    if (!existing) return NextResponse.json({ success: false, error: 'Exam not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);

    const status = await getExamPublishStatus(coachingCenterId, examId);
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    return apiErrorResponse(error, '/api/exams/[examId]/publish-status GET');
  }
}

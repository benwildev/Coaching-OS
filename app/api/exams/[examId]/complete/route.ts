import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { transitionExamStatus } from '@/lib/services/exam.service';
import { EXAM_STATUS } from '@/lib/validations/exam';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { examId } = await params;

    // Phase 10.5: previously no branch check.
    const existing = await prisma.exam.findFirst({ where: { id: examId, coachingCenterId }, select: { branchId: true } });
    if (!existing) return NextResponse.json({ success: false, error: 'Exam not found' }, { status: 404 });
    assertBranchAccess(user, existing.branchId);

    const exam = await transitionExamStatus(
      coachingCenterId,
      examId,
      EXAM_STATUS.COMPLETED,
      user.userId,
      user.role
    );

    return NextResponse.json({ success: true, exam, status: exam.status });
  } catch (error: any) {
    console.error('[API /api/exams/[examId]/complete POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to complete exam' }, { status });
  }
}

import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { addExamSubject } from '@/lib/services/exam.service';
import { addExamSubjectSchema } from '@/lib/validations/exam';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    // Phase 10.5: previously no role check and no branch check — any
    // authenticated tenant user could read any branch's exam structure.
    await requireRole(['OWNER', 'ADMIN', 'STAFF', 'TEACHER']);
    const { examId } = await params;

    const exam = await prisma.exam.findFirst({ where: { id: examId, coachingCenterId }, select: { branchId: true } });
    if (!exam) return NextResponse.json({ success: false, error: 'Exam not found' }, { status: 404 });
    assertBranchAccess(user, exam.branchId);

    const subjects = await prisma.examSubject.findMany({
      where: {
        examId,
        exam: { coachingCenterId },
      },
      include: {
        subject: { select: { id: true, name: true, banglaName: true, code: true } },
      },
      orderBy: { examDate: 'asc' },
    });

    return NextResponse.json({ success: true, subjects });
  } catch (error: any) {
    console.error('[API /api/exams/[examId]/subjects GET] Error:', error);
    if (error.message === 'UNAUTHORIZED' || error.message === 'TENANT_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const { examId } = await params;

    // Phase 10.5: previously no branch check.
    const exam = await prisma.exam.findFirst({ where: { id: examId, coachingCenterId }, select: { branchId: true } });
    if (!exam) return NextResponse.json({ success: false, error: 'Exam not found' }, { status: 404 });
    assertBranchAccess(user, exam.branchId);

    const body = await request.json();
    const validated = addExamSubjectSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validated.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const examSubject = await addExamSubject(
      coachingCenterId,
      examId,
      validated.data,
      user.userId
    );

    return NextResponse.json({ success: true, examSubject }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/exams/[examId]/subjects POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to add exam subject' }, { status });
  }
}

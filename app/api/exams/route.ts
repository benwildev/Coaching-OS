import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess, resolveEffectiveBranchId } from '@/lib/auth/session';
import { listExams, createExam } from '@/lib/services/exam.service';
import { createExamSchema } from '@/lib/validations/exam';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { searchParams } = new URL(request.url);

    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);

    const result = await listExams(coachingCenterId, {
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
      pageSize: searchParams.get('pageSize') ? parseInt(searchParams.get('pageSize')!, 10) : 15,
      branchId,
      academicSessionId: searchParams.get('session') || undefined,
      academicProgramId: searchParams.get('program') || undefined,
      academicClassId: searchParams.get('class') || undefined,
      academicGroupId: searchParams.get('group') || undefined,
      batchId: searchParams.get('batch') || undefined,
      examType: searchParams.get('type') || undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[API /api/exams GET] Error:', error);
    if (error.message === 'UNAUTHORIZED' || error.message === 'TENANT_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const body = await request.json();
    const validated = createExamSchema.safeParse(body);
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

    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const exam = await createExam(
      coachingCenterId,
      validated.data,
      user.userId,
      user.branchId || undefined
    );

    return NextResponse.json({ success: true, exam }, { status: 201 });
  } catch (error: any) {
    console.error('[API /api/exams POST] Error:', error);
    const status = error.message?.startsWith('FORBIDDEN') ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to create exam' }, { status });
  }
}

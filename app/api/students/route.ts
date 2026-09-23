import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import {
  getStudentsList,
  createStudentAdmission,
} from '@/lib/services/student.service';
import { admissionSchema } from '@/lib/validations/student';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.coachingCenterId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || searchParams.get('q') || undefined;
    const sessionId = searchParams.get('sessionId') || searchParams.get('session') || undefined;
    const programId = searchParams.get('programId') || searchParams.get('program') || undefined;
    const classId = searchParams.get('classId') || searchParams.get('class') || undefined;
    const groupId = searchParams.get('groupId') || searchParams.get('group') || undefined;
    const courseId = searchParams.get('courseId') || searchParams.get('course') || undefined;
    const batchId = searchParams.get('batchId') || searchParams.get('batch') || undefined;
    const branchId = searchParams.get('branchId') || searchParams.get('branch') || undefined;
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '15', 10);
    const sortBy = (searchParams.get('sortBy') as any) || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') as any) || 'desc';

    const result = await getStudentsList(session.coachingCenterId, {
      search,
      sessionId,
      programId,
      classId,
      groupId,
      courseId,
      batchId,
      branchId,
      status,
      page,
      pageSize,
      sortBy,
      sortOrder,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API /api/students GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve students' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.coachingCenterId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = admissionSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validated.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const student = await createStudentAdmission(
      session.coachingCenterId,
      validated.data,
      session.userId
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Student admitted successfully',
        student,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[API /api/students POST] Error:', error);
    const msg = error?.message || 'Failed to process admission';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

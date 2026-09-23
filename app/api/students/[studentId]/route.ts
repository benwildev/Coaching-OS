import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getStudentById, updateStudent } from '@/lib/services/student.service';
import { studentUpdateSchema } from '@/lib/validations/student';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  props: { params: Promise<{ studentId: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.coachingCenterId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { studentId } = await props.params;
    const student = await getStudentById(session.coachingCenterId, studentId);

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    return NextResponse.json({ student });
  } catch (error) {
    console.error('[API /api/students/[studentId] GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve student profile' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ studentId: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.coachingCenterId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { studentId } = await props.params;
    const body = await request.json();

    const validated = studentUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validated.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const student = await updateStudent(
      session.coachingCenterId,
      studentId,
      validated.data,
      session.userId
    );

    return NextResponse.json({
      success: true,
      message: 'Student updated successfully',
      student,
    });
  } catch (error: any) {
    console.error('[API /api/students/[studentId] PUT] Error:', error);
    const msg = error?.message || 'Failed to update student profile';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

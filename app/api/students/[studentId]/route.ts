import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { getStudentById, updateStudent } from '@/lib/services/student.service';
import { studentUpdateSchema } from '@/lib/validations/student';
import { assertTeacherCanAccessStudent } from '@/lib/auth/teacher-scope';

export const dynamic = 'force-dynamic';

// Phase 10.4 / 14.3: reads stay open to TEACHER, but strictly scoped to the teacher's
// active assigned batches and active enrolled students.

export async function GET(
  request: Request,
  props: { params: Promise<{ studentId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('students.read');

    const { studentId } = await props.params;
    const student = await getStudentById(coachingCenterId, studentId);

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    // A branch-locked STAFF/TEACHER may only read a student in their own
    // branch — closes the cross-branch profile/PII leak (guardian details,
    // NID, address, phone) that existed here before.
    assertBranchAccess(user, student.branchId);
    await assertTeacherCanAccessStudent(user, student.id);

    return NextResponse.json({ student });
  } catch (error: any) {
    console.error('[API /api/students/[studentId] GET] Error:', error);
    if (error?.message?.startsWith('FORBIDDEN') || error?.message === 'FORBIDDEN_BRANCH' || error?.message === 'FORBIDDEN_TEACHER_SCOPE') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('students.update');

    const { studentId } = await props.params;

    // Verify branch access to the EXISTING record before applying any
    // change — a branch-locked STAFF must not be able to edit (or move,
    // via a branchId in the body) a student outside their own branch.
    const existing = await getStudentById(coachingCenterId, studentId);
    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    assertBranchAccess(user, existing.branchId);

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

    // A branch-locked STAFF must not be able to relocate a student (or a
    // new enrollment) to a branch outside their own, even though they're
    // allowed to edit this particular student (checked above).
    if (validated.data.branchId) assertBranchAccess(user, validated.data.branchId);
    if (validated.data.newEnrollment?.branchId) assertBranchAccess(user, validated.data.newEnrollment.branchId);

    const student = await updateStudent(
      coachingCenterId,
      studentId,
      validated.data,
      user.userId
    );

    return NextResponse.json({
      success: true,
      message: 'Student updated successfully',
      student,
    });
  } catch (error: any) {
    console.error('[API /api/students/[studentId] PUT] Error:', error);
    if (error?.message === 'FORBIDDEN_BRANCH' || error?.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Known, safe-to-surface validation failures raised by updateStudent
    // (e.g. duplicate studentIdCode) are short "CODE" or "CODE: detail"
    // strings; anything else (a raw Prisma/db error) must not reach the
    // client verbatim.
    const raw = String(error?.message || '');
    const msg = /^[A-Z][A-Z0-9_]+(:.*)?$/.test(raw) ? raw : 'Failed to update student profile';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

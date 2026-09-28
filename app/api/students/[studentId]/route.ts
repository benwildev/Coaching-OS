import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getStudentById, updateStudent } from '@/lib/services/student.service';
import { studentUpdateSchema } from '@/lib/validations/student';

export const dynamic = 'force-dynamic';

// Phase 10.4: see app/api/students/route.ts — reads stay open to TEACHER,
// scoped to the caller's branch; edits are office-staff only.
const READ_ROLES = ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'] as const;
const WRITE_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const;

export async function GET(
  request: Request,
  props: { params: Promise<{ studentId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole([...READ_ROLES]);

    const { studentId } = await props.params;
    const student = await getStudentById(coachingCenterId, studentId);

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    // A branch-locked STAFF/TEACHER may only read a student in their own
    // branch — closes the cross-branch profile/PII leak (guardian details,
    // NID, address, phone) that existed here before.
    assertBranchAccess(user, student.branchId);

    return NextResponse.json({ student });
  } catch (error: any) {
    console.error('[API /api/students/[studentId] GET] Error:', error);
    if (error?.message === 'FORBIDDEN_BRANCH' || error?.message === 'FORBIDDEN') {
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
    await requireRole([...WRITE_ROLES]);

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
    const msg = error?.message || 'Failed to update student profile';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

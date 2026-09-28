import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId } from '@/lib/auth/session';
import {
  getStudentsList,
  createStudentAdmission,
} from '@/lib/services/student.service';
import { admissionSchema } from '@/lib/validations/student';

export const dynamic = 'force-dynamic';

// Phase 10.4: this route previously only checked `getSession()` — any
// authenticated staff user, any role, any branch, could list or admit
// students anywhere in the tenant. Reading is kept available to TEACHER
// (existing business behavior — a teacher looking up a student's profile
// is legitimate), but every read is now branch-scoped like every other
// module, and admitting/editing a student master record is restricted to
// office-staff roles (OWNER/ADMIN/STAFF), matching how the business itself
// describes these responsibilities.
const READ_ROLES = ['OWNER', 'ADMIN', 'STAFF', 'TEACHER'] as const;
const WRITE_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const;

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole([...READ_ROLES]);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || searchParams.get('q') || undefined;
    const sessionId = searchParams.get('sessionId') || searchParams.get('session') || undefined;
    const programId = searchParams.get('programId') || searchParams.get('program') || undefined;
    const classId = searchParams.get('classId') || searchParams.get('class') || undefined;
    const groupId = searchParams.get('groupId') || searchParams.get('group') || undefined;
    const courseId = searchParams.get('courseId') || searchParams.get('course') || undefined;
    const batchId = searchParams.get('batchId') || searchParams.get('batch') || undefined;
    const requestedBranchId = searchParams.get('branchId') || searchParams.get('branch') || undefined;
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '15', 10);
    const sortBy = (searchParams.get('sortBy') as any) || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') as any) || 'desc';

    // A branch-locked STAFF/TEACHER always gets their own branch regardless
    // of what ?branchId= asks for — the client value is only honored for a
    // center-wide OWNER/ADMIN (or a branch-unscoped STAFF/TEACHER).
    const branchId = resolveEffectiveBranchId(user, requestedBranchId);

    const result = await getStudentsList(coachingCenterId, {
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
    const status = error instanceof Error && error.message === 'FORBIDDEN' ? 403 : 401;
    return NextResponse.json(
      { error: status === 403 ? 'Forbidden' : 'Unauthorized' },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole([...WRITE_ROLES]);

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
      coachingCenterId,
      validated.data,
      user.userId
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
    if (error?.message === 'UNAUTHORIZED' || error?.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: error.message === 'FORBIDDEN' ? 403 : 401 });
    }
    const msg = error?.message || 'Failed to process admission';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

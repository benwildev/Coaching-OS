import { NextResponse } from 'next/server';
import { requireTenant, requireRole, resolveEffectiveBranchId, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
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
    return apiErrorResponse(error, '/api/students GET');
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

    // Branch authorization: non-OWNER/non-ADMIN cannot admit students to other branches
    assertBranchAccess(user, validated.data.branchId);

    const result = await createStudentAdmission(
      coachingCenterId,
      validated.data,
      user.userId,
      user.role
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Student admitted successfully',
        idempotentReplay: (result as any).idempotentReplay ?? false,
        student: {
          id: result.id,
          studentId: result.studentIdCode,
          name: result.name,
          banglaName: result.banglaName,
        },
        enrollment: result.enrollment,
        feeAssignment: result.feeAssignment,
        feeAssignments: result.feeAssignments,
        invoice: result.invoice,
        payment: result.payment,
        receiptNumber: result.receiptNumber,
        discountApproved: !result.isDiscountPending,
        portalAccount: (result as any).portalAccount ?? null,
        portalProvisioning: (result as any).portalProvisioning ?? null,
      },
      { status: 201 }
    );
  } catch (error) {
    return apiErrorResponse(error, '/api/students POST');
  }
}

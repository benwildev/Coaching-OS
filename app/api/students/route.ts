import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, resolveEffectiveBranchId, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import {
  getStudentsList,
  createStudentAdmission,
} from '@/lib/services/student.service';
import { admissionSchema } from '@/lib/validations/student';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { getTeacherAuthorizedBatchIds } from '@/lib/auth/teacher-scope';

export const dynamic = 'force-dynamic';

// Phase 10.4 / 14.3: reads stay open to TEACHER, but strictly scoped to the teacher's
// active assigned batches and active enrolled students. Management roles (OWNER/ADMIN/STAFF)
// retain full branch/tenant management reads.

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('students.read');

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

    let allowedBatchIds: string[] | undefined;
    if (user.role === 'TEACHER') {
      const teacher = await getTeacherByUserId(coachingCenterId, user.userId);
      allowedBatchIds = teacher ? await getTeacherAuthorizedBatchIds(coachingCenterId, teacher.id) : [];
    }

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
      allowedBatchIds,
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
    await requirePermission('students.create');

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

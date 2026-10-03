import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getTeacherById, updateTeacher, deleteTeacher, getTeacherByUserId } from '@/lib/services/teacher.service';
import { teacherUpdateSchema } from '@/lib/validations/teacher';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { teacherId } = await props.params;

    // TEACHER may only view their own profile. Other roles require teachers.read.
    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      if (!own || own.id !== teacherId) {
        throw new Error('FORBIDDEN_TEACHER_SCOPE');
      }
    } else {
      await requirePermission('teachers.read');
    }

    const teacher = await getTeacherById(coachingCenterId, teacherId);
    if (!teacher) return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });

    assertBranchAccess(user, teacher.branchId);

    return NextResponse.json({ success: true, teacher });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId] GET');
  }
}

export async function PUT(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('teachers.update');

    const { teacherId } = await props.params;
    const body = await request.json();
    const validated = teacherUpdateSchema.safeParse(body);
    if (!validated.success) {
      const fieldErrors = validated.error.flatten().fieldErrors;
      const firstMsg = Object.values(fieldErrors).flat()[0] || 'Validation failed';
      return NextResponse.json(
        { success: false, error: firstMsg, details: fieldErrors },
        { status: 400 }
      );
    }

    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const teacher = await updateTeacher(coachingCenterId, teacherId, validated.data, user.userId);
    return NextResponse.json({ success: true, teacher });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId] PUT');
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('teachers.delete');

    const { teacherId } = await props.params;
    const existing = await getTeacherById(coachingCenterId, teacherId);
    if (!existing) return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });

    assertBranchAccess(user, existing.branchId);

    await deleteTeacher(coachingCenterId, teacherId, user.userId);
    return NextResponse.json({ success: true, message: 'Teacher deleted successfully' });
  } catch (error: any) {
    if (error?.message === 'CANNOT_DELETE_TEACHER_WITH_HISTORY') {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete teacher with recorded class sessions or homeworks. Please set their status to Inactive instead to preserve historical records.',
        },
        { status: 400 }
      );
    }
    return apiErrorResponse(error, '/api/teachers/[teacherId] DELETE');
  }
}

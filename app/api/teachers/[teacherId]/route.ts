import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getTeacherById, updateTeacher, getTeacherByUserId } from '@/lib/services/teacher.service';
import { teacherUpdateSchema } from '@/lib/validations/teacher';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { teacherId } = await props.params;

    const teacher = await getTeacherById(coachingCenterId, teacherId);
    if (!teacher) return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });

    // Phase 10.5: previously no branch check at all — a branch-locked
    // STAFF could view any teacher's profile regardless of branch.
    assertBranchAccess(user, teacher.branchId);

    // Teachers may see their own full profile; other teachers' contact/HR
    // details are unnecessary for them and are redacted.
    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      if (own?.id !== teacherId) {
        // Phase 10.5: `user` (the linked login's email/name/status) is now
        // part of getTeacherById's result too — strip it here for the same
        // reason phone/email/bio already are.
        const { phone, email, bio, joiningDate, attendances, user: _linkedUser, ...publicFields } = teacher as any;
        return NextResponse.json({ success: true, teacher: publicFields, redacted: true });
      }
    }

    return NextResponse.json({ success: true, teacher });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId] GET');
  }
}

export async function PUT(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

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

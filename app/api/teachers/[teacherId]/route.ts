import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { getTeacherById, updateTeacher, getTeacherByUserId } from '@/lib/services/teacher.service';
import { teacherUpdateSchema } from '@/lib/validations/teacher';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { teacherId } = await props.params;

    const teacher = await getTeacherById(coachingCenterId, teacherId);
    if (!teacher) return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });

    // Teachers may see their own full profile; other teachers' contact/HR
    // details are unnecessary for them and are redacted.
    if (user.role === 'TEACHER') {
      const own = await getTeacherByUserId(coachingCenterId, user.userId);
      if (own?.id !== teacherId) {
        const { phone, email, bio, joiningDate, attendances, ...publicFields } = teacher as any;
        return NextResponse.json({ success: true, teacher: publicFields, redacted: true });
      }
    }

    return NextResponse.json({ success: true, teacher });
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (validated.data.branchId) {
      assertBranchAccess(user, validated.data.branchId);
    }

    const teacher = await updateTeacher(coachingCenterId, teacherId, validated.data, user.userId);
    return NextResponse.json({ success: true, teacher });
  } catch (error: any) {
    console.error('[API /api/teachers/[teacherId] PUT] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to update teacher' }, { status: 400 });
  }
}

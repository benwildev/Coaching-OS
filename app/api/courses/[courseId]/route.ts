import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getCourseById, updateCourse, archiveCourse } from '@/lib/services/course.service';
import { courseUpdateSchema } from '@/lib/validations/course';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { getTeacherAuthorizedCourseIds } from '@/lib/auth/teacher-scope';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ courseId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('courses.read');
    const { courseId } = await props.params;
    const course = await getCourseById(coachingCenterId, courseId);
    if (!course) return NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 });

    if (user.role === 'TEACHER') {
      const teacher = await getTeacherByUserId(coachingCenterId, user.userId);
      const authorizedCourseIds = teacher ? await getTeacherAuthorizedCourseIds(coachingCenterId, teacher.id) : [];
      if (!authorizedCourseIds.includes(courseId)) {
        throw new Error('FORBIDDEN_TEACHER_SCOPE');
      }
    }

    return NextResponse.json({ success: true, course });
  } catch (error) {
    return apiErrorResponse(error, '/api/courses/[courseId] GET');
  }
}

export async function PUT(request: Request, props: { params: Promise<{ courseId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('courses.update');

    const { courseId } = await props.params;
    const body = await request.json();
    const validated = courseUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const course = await updateCourse(coachingCenterId, courseId, validated.data, user.userId);
    return NextResponse.json({ success: true, course });
  } catch (error) {
    return apiErrorResponse(error, '/api/courses/[courseId] PUT');
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ courseId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('courses.delete');

    const { courseId } = await props.params;
    const course = await archiveCourse(coachingCenterId, courseId, user.userId);
    return NextResponse.json({ success: true, course });
  } catch (error) {
    return apiErrorResponse(error, '/api/courses/[courseId] DELETE');
  }
}

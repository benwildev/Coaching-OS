import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getCoursesList, createCourse } from '@/lib/services/course.service';
import { courseSchema } from '@/lib/validations/course';
import { getTeacherByUserId } from '@/lib/services/teacher.service';
import { getTeacherAuthorizedCourseIds } from '@/lib/auth/teacher-scope';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('courses.read');
    const { searchParams } = new URL(request.url);

    let courseIds: string[] | undefined;
    if (user.role === 'TEACHER') {
      const teacher = await getTeacherByUserId(coachingCenterId, user.userId);
      courseIds = teacher ? await getTeacherAuthorizedCourseIds(coachingCenterId, teacher.id) : [];
    }

    const result = await getCoursesList(coachingCenterId, {
      search: searchParams.get('search') || undefined,
      programId: searchParams.get('program') || undefined,
      classId: searchParams.get('class') || undefined,
      groupId: searchParams.get('group') || undefined,
      status: searchParams.get('status') || undefined,
      courseIds,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '20', 10),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/courses GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('courses.create');

    const body = await request.json();
    const validated = courseSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const course = await createCourse(coachingCenterId, validated.data, user.userId);
    return NextResponse.json({ success: true, course }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/courses POST');
  }
}

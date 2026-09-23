import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { getCoursesList, createCourse } from '@/lib/services/course.service';
import { courseSchema } from '@/lib/validations/course';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { coachingCenterId } = await requireTenant();
    const { searchParams } = new URL(request.url);

    const result = await getCoursesList(coachingCenterId, {
      search: searchParams.get('search') || undefined,
      programId: searchParams.get('program') || undefined,
      classId: searchParams.get('class') || undefined,
      groupId: searchParams.get('group') || undefined,
      status: searchParams.get('status') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '20', 10),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[API /api/courses GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

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
  } catch (error: any) {
    console.error('[API /api/courses POST] Error:', error);
    const status = error.message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ success: false, error: error.message || 'Failed to create course' }, { status });
  }
}

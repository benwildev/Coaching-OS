import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { getCourseById, updateCourse, archiveCourse } from '@/lib/services/course.service';
import { courseUpdateSchema } from '@/lib/validations/course';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ courseId: string }> }) {
  try {
    const { coachingCenterId } = await requireTenant();
    const { courseId } = await props.params;
    const course = await getCourseById(coachingCenterId, courseId);
    if (!course) return NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 });
    return NextResponse.json({ success: true, course });
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PUT(request: Request, props: { params: Promise<{ courseId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

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
  } catch (error: any) {
    console.error('[API /api/courses/[courseId] PUT] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to update course' }, { status: 400 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ courseId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const { courseId } = await props.params;
    const course = await archiveCourse(coachingCenterId, courseId, user.userId);
    return NextResponse.json({ success: true, course });
  } catch (error: any) {
    console.error('[API /api/courses/[courseId] DELETE] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to archive course' }, { status: 400 });
  }
}

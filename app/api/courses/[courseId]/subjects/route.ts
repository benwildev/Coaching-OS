import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { replaceCourseSubjects } from '@/lib/services/course.service';
import { courseSubjectsReplaceSchema } from '@/lib/validations/course';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, props: { params: Promise<{ courseId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const { courseId } = await props.params;
    const body = await request.json();
    const validated = courseSubjectsReplaceSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const course = await replaceCourseSubjects(coachingCenterId, courseId, validated.data.subjects, user.userId);
    return NextResponse.json({ success: true, course });
  } catch (error) {
    return apiErrorResponse(error, '/api/courses/[courseId]/subjects PUT');
  }
}

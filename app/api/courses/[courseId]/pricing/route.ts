import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { getCoursePricing, updateCoursePricing } from '@/lib/services/course-pricing.service';
import { coursePricingSchema } from '@/lib/validations/course';

export const dynamic = 'force-dynamic';

// Course pricing is financial configuration. Reading is open to the office
// roles that quote fees (OWNER/ADMIN/STAFF); TEACHER never sees or edits it.
// Only OWNER/ADMIN may change it (same gate as editing the course itself).
// The tenant always comes from the session — never from the request.

export async function GET(_request: Request, props: { params: Promise<{ courseId: string }> }) {
  try {
    const { coachingCenterId } = await requireTenant();
    await requirePermission('fees.structures.read');
    const { courseId } = await props.params;

    const pricing = await getCoursePricing(coachingCenterId, courseId);
    if (!pricing) throw new Error('COURSE_NOT_FOUND');
    return NextResponse.json({ success: true, pricing });
  } catch (error) {
    return apiErrorResponse(error, '/api/courses/[courseId]/pricing GET');
  }
}

export async function PUT(request: Request, props: { params: Promise<{ courseId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('courses.pricing.update');
    const { courseId } = await props.params;

    const validated = coursePricingSchema.safeParse(await request.json());
    if (!validated.success) return validationErrorResponse(validated.error.flatten().fieldErrors);

    const pricing = await updateCoursePricing(coachingCenterId, courseId, validated.data, user.userId, user.branchId ?? null);
    return NextResponse.json({ success: true, pricing });
  } catch (error) {
    return apiErrorResponse(error, '/api/courses/[courseId]/pricing PUT');
  }
}

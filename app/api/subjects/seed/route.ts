import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { seedStandardSubjectsForCenter } from '@/lib/services/academic.service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { coachingCenterId } = await requireTenant();
    // Phase 10.5: previously no role check on this bulk academic-setup action.
    await requirePermission('courses.update');
    const body = await request.json().catch(() => ({}));
    const { classId } = body;

    const created = await seedStandardSubjectsForCenter(coachingCenterId, classId);

    return NextResponse.json({
      success: true,
      message: `Successfully seeded ${created.length} standard subjects`,
      createdCount: created.length,
      subjects: created,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/subjects/seed POST');
  }
}

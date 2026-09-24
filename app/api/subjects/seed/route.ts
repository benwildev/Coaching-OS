import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { seedStandardSubjectsForCenter } from '@/lib/services/academic.service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { coachingCenterId } = await requireTenant();
    const body = await request.json().catch(() => ({}));
    const { classId } = body;

    const created = await seedStandardSubjectsForCenter(coachingCenterId, classId);

    return NextResponse.json({
      success: true,
      message: `Successfully seeded ${created.length} standard subjects`,
      createdCount: created.length,
      subjects: created,
    });
  } catch (error: any) {
    console.error('[API /api/subjects/seed POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to seed subjects' },
      { status: 500 }
    );
  }
}

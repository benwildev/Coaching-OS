import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getAcademicHierarchyOptions } from '@/lib/services/student.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.coachingCenterId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const options = await getAcademicHierarchyOptions(session.coachingCenterId);
    return NextResponse.json(options);
  } catch (error) {
    console.error('[API /api/academic/options GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve academic hierarchy options' },
      { status: 500 }
    );
  }
}

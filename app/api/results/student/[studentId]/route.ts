import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { getStudentResultHistory } from '@/lib/services/exam-result.service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { coachingCenterId } = await requireTenant();
    const { studentId } = await params;
    const { searchParams } = new URL(request.url);

    const isStudentPortal = searchParams.get('portal') === 'true';

    const history = await getStudentResultHistory(
      coachingCenterId,
      studentId,
      isStudentPortal
    );

    return NextResponse.json({ success: true, history });
  } catch (error: any) {
    console.error('[API /api/results/student/[studentId] GET] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to load student result history' }, { status: 400 });
  }
}

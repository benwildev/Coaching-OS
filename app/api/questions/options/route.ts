import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getQuestionBankOptions, resolveQuestionScope } from '@/lib/services/question.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const scope = await resolveQuestionScope(coachingCenterId, user);
    const options = await getQuestionBankOptions(scope);
    return NextResponse.json({ success: true, ...options });
  } catch (error) {
    return apiErrorResponse(error, '/api/questions/options GET');
  }
}

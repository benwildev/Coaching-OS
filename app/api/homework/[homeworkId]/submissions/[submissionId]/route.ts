import { NextResponse } from 'next/server';
import { requirePermission, requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { resolveHomeworkScope, reviewSubmission } from '@/lib/services/homework.service';
import { reviewSubmissionSchema } from '@/lib/validations/homework';
import { requireFeature } from '@/lib/services/feature-access.service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ homeworkId: string; submissionId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('homework.update');
    await requireFeature(coachingCenterId, 'HOMEWORK');
    const { homeworkId, submissionId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = reviewSubmissionSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const scope = await resolveHomeworkScope(coachingCenterId, user);
    const submission = await reviewSubmission(scope, homeworkId, submissionId, parsed.data);
    return NextResponse.json({ success: true, submission });
  } catch (error) {
    return apiErrorResponse(error, '/api/homework/[homeworkId]/submissions/[submissionId] PATCH');
  }
}

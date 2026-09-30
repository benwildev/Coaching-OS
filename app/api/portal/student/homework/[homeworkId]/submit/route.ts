import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { submitHomework } from '@/lib/services/homework.service';
import { submitHomeworkSchema } from '@/lib/validations/homework';
import { requireFeature } from '@/lib/services/feature-access.service';

export const dynamic = 'force-dynamic';

/**
 * studentId is the authenticated portal session's own studentId only — a
 * student can never submit for another student, another batch, or another
 * tenant (AGENTS.md §10). Idempotent: a retried/double-clicked submit for
 * the same homework updates the same row (unique on homeworkId+studentId)
 * instead of creating a duplicate.
 */
export async function POST(request: Request, { params }: { params: Promise<{ homeworkId: string }> }) {
  try {
    const session = await requireStudentPortal();
    await requireFeature(session.coachingCenterId, 'HOMEWORK');
    const { homeworkId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = submitHomeworkSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const submission = await submitHomework(session.coachingCenterId, session.studentId!, homeworkId, parsed.data);
    return NextResponse.json({ success: true, submission });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/homework/[homeworkId]/submit POST');
  }
}

import { NextResponse } from 'next/server';
import { requireTenant, requireRole, assertBranchAccess } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { reviewManualSubmission } from '@/lib/services/payment-gateway.service';
import prisma from '@/lib/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const reviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const { submissionId } = await params;
    const body = await req.json();
    const parsed = reviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid review payload' },
        { status: 400 }
      );
    }

    const submission = await prisma.manualPaymentSubmission.findFirst({
      where: { id: submissionId, coachingCenterId },
    });
    if (!submission) {
      return NextResponse.json({ success: false, error: 'Submission not found' }, { status: 404 });
    }
    assertBranchAccess(user, submission.branchId);

    const result = await reviewManualSubmission({
      coachingCenterId,
      submissionId,
      action: parsed.data.action,
      rejectionReason: parsed.data.rejectionReason,
      actorId: user.userId,
    });

    return NextResponse.json({ ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/manual-submissions/[submissionId]/review POST');
  }
}

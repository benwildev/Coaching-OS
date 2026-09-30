import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/auth/portal-session';
import { assertGuardianOwnsStudent } from '@/lib/services/portal-auth.service';
import { submitManualPayment } from '@/lib/services/payment-gateway.service';
import prisma from '@/lib/db';
import { apiErrorResponse } from '@/lib/api-error';
import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const manualSubmitSchema = z.object({
  paymentMethod: z.nativeEnum(PaymentMethod),
  amount: z.number().positive('Payment amount must be greater than zero'),
  transactionId: z.string().max(100).optional(),
  referenceNumber: z.string().max(100).optional(),
  senderMobile: z.string().max(20).optional(),
  bankName: z.string().max(100).optional(),
  studentNote: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const session = await requirePortalAuth();
    const { invoiceId } = await params;

    const body = await req.json();
    const parsed = manualSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid manual payment payload' },
        { status: 400 }
      );
    }

    const invoice = await prisma.feeInvoice.findFirst({
      where: { id: invoiceId, coachingCenterId: session.coachingCenterId },
    });

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    // Check authorization
    if (session.portalType === 'STUDENT') {
      if (invoice.studentId !== session.studentId) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    } else if (session.portalType === 'GUARDIAN') {
      await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, invoice.studentId);
    }

    const submission = await submitManualPayment({
      coachingCenterId: session.coachingCenterId,
      invoiceId,
      studentId: invoice.studentId,
      paymentMethod: parsed.data.paymentMethod,
      amount: parsed.data.amount,
      transactionId: parsed.data.transactionId,
      referenceNumber: parsed.data.referenceNumber,
      senderMobile: parsed.data.senderMobile,
      bankName: parsed.data.bankName,
      studentNote: parsed.data.studentNote,
    });

    return NextResponse.json({ success: true, submission });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/payments/[invoiceId]/manual-submit POST');
  }
}

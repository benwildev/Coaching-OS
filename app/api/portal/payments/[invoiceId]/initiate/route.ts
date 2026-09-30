import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/auth/portal-session';
import { assertGuardianOwnsStudent } from '@/lib/services/portal-auth.service';
import { initiateOnlinePayment } from '@/lib/services/payment-gateway.service';
import prisma from '@/lib/db';
import { apiErrorResponse } from '@/lib/api-error';
import { PaymentGatewayProviderType } from '@prisma/client';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const initiateSchema = z.object({
  provider: z.nativeEnum(PaymentGatewayProviderType),
});

function getBaseUrl(req: Request): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  if (host) {
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const session = await requirePortalAuth();
    const { invoiceId } = await params;

    const body = await req.json();
    const parsed = initiateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid provider' },
        { status: 400 }
      );
    }

    const invoice = await prisma.feeInvoice.findFirst({
      where: { id: invoiceId, coachingCenterId: session.coachingCenterId },
      include: { student: true },
    });

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    // Authorization check
    if (session.portalType === 'STUDENT') {
      if (invoice.studentId !== session.studentId) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    } else if (session.portalType === 'GUARDIAN') {
      await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, invoice.studentId);
    }

    const baseUrl = getBaseUrl(req);

    const result = await initiateOnlinePayment({
      coachingCenterId: session.coachingCenterId,
      invoiceId,
      studentId: invoice.studentId,
      providerType: parsed.data.provider,
      callbackBaseUrl: baseUrl,
      ipnBaseUrl: baseUrl,
      customerPhone: invoice.student.phone || undefined,
      customerEmail: invoice.student.email || undefined,
      actorId: session.portalAccountId,
    });

    return NextResponse.json({ ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/payments/[invoiceId]/initiate POST');
  }
}

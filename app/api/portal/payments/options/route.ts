import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/auth/portal-session';
import { assertGuardianOwnsStudent } from '@/lib/services/portal-auth.service';
import { getPortalPaymentOptions } from '@/lib/services/payment-gateway.service';
import prisma from '@/lib/db';
import { apiErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await requirePortalAuth();
    const url = new URL(req.url);
    const invoiceId = url.searchParams.get('invoiceId') || undefined;

    if (invoiceId) {
      const invoice = await prisma.feeInvoice.findFirst({
        where: { id: invoiceId, coachingCenterId: session.coachingCenterId },
        select: { id: true, studentId: true },
      });

      if (!invoice) {
        return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
      }

      if (session.portalType === 'STUDENT') {
        if (invoice.studentId !== session.studentId) {
          return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }
      } else if (session.portalType === 'GUARDIAN') {
        await assertGuardianOwnsStudent(session.coachingCenterId, session.guardianId!, invoice.studentId);
      }
    }

    const options = await getPortalPaymentOptions(session.coachingCenterId, invoiceId);
    return NextResponse.json({ success: true, ...options });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/payments/options GET');
  }
}

import { NextResponse } from 'next/server';
import { verifyAndCompletePayment } from '@/lib/services/payment-gateway.service';
import { PaymentGatewayProviderType } from '@prisma/client';

export const dynamic = 'force-dynamic';

function getRedirectUrl(req: Request, path: string): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const base = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}${path}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const merchantTxId = url.searchParams.get('merchantTxId') || '';
  const centerId = url.searchParams.get('centerId') || '';
  const paymentID = url.searchParams.get('paymentID') || undefined;
  const status = url.searchParams.get('status') || undefined;

  if (!merchantTxId || !centerId) {
    return NextResponse.redirect(
      getRedirectUrl(req, '/portal/payments/callback?status=failed&reason=Missing+transaction+reference')
    );
  }

  try {
    const result = await verifyAndCompletePayment({
      coachingCenterId: centerId,
      providerType: PaymentGatewayProviderType.BKASH,
      merchantTransactionId: merchantTxId,
      rawParams: { paymentID, status },
    });

    if (result.status === 'SUCCESS') {
      return NextResponse.redirect(
        getRedirectUrl(
          req,
          `/portal/payments/callback?status=success&receiptNumber=${encodeURIComponent(
            result.receiptNumber || ''
          )}&amount=${result.amount}`
        )
      );
    }

    const reason = encodeURIComponent(result.failureReason || 'Payment verification failed');
    return NextResponse.redirect(
      getRedirectUrl(req, `/portal/payments/callback?status=${result.status.toLowerCase()}&reason=${reason}`)
    );
  } catch (error) {
    const errMessage = encodeURIComponent(error instanceof Error ? error.message : 'Payment verification error');
    return NextResponse.redirect(getRedirectUrl(req, `/portal/payments/callback?status=failed&reason=${errMessage}`));
  }
}

export async function POST(req: Request) {
  return GET(req);
}

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

async function handleSSLCommerzReturn(req: Request) {
  const url = new URL(req.url);
  let merchantTxId = url.searchParams.get('merchantTxId') || '';
  let centerId = url.searchParams.get('centerId') || '';

  const rawParams: Record<string, string | undefined> = {};

  // Parse body if POST
  if (req.method === 'POST') {
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        const formData = await req.formData();
        formData.forEach((value, key) => {
          rawParams[key] = String(value);
        });
      } else if (contentType.includes('application/json')) {
        const json = await req.json();
        Object.assign(rawParams, json);
      }
    } catch {
      // Ignore body parse errors if query parameters provide context
    }
  }

  // Fallback to form body for tran_id / centerId if missing in query
  if (!merchantTxId && rawParams.tran_id) {
    merchantTxId = rawParams.tran_id;
  }
  if (!centerId && rawParams.value_a) {
    centerId = rawParams.value_a;
  }

  // Also record val_id and status from query if not in body
  if (!rawParams.val_id && url.searchParams.get('val_id')) {
    rawParams.val_id = url.searchParams.get('val_id') || undefined;
  }
  if (!rawParams.status && url.searchParams.get('status')) {
    rawParams.status = url.searchParams.get('status') || undefined;
  }

  if (!merchantTxId || !centerId) {
    return NextResponse.redirect(
      getRedirectUrl(req, '/portal/payments/callback?status=failed&reason=Missing+transaction+reference')
    );
  }

  try {
    const result = await verifyAndCompletePayment({
      coachingCenterId: centerId,
      providerType: PaymentGatewayProviderType.SSLCOMMERZ,
      merchantTransactionId: merchantTxId,
      rawParams,
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
  return handleSSLCommerzReturn(req);
}

export async function GET(req: Request) {
  return handleSSLCommerzReturn(req);
}

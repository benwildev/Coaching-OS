import { NextResponse } from 'next/server';
import { verifyAndCompletePayment } from '@/lib/services/payment-gateway.service';
import { PaymentGatewayProviderType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    let merchantTxId = url.searchParams.get('merchantTxId') || '';
    let centerId = url.searchParams.get('centerId') || '';

    const rawParams: Record<string, string | undefined> = {};

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
      // ignore parse errors
    }

    if (!merchantTxId && rawParams.tran_id) {
      merchantTxId = rawParams.tran_id;
    }
    if (!centerId && rawParams.value_a) {
      centerId = rawParams.value_a;
    }

    if (!merchantTxId || !centerId) {
      return NextResponse.json({ success: false, error: 'Missing merchantTxId or centerId' }, { status: 400 });
    }

    const result = await verifyAndCompletePayment({
      coachingCenterId: centerId,
      providerType: PaymentGatewayProviderType.SSLCOMMERZ,
      merchantTransactionId: merchantTxId,
      rawParams,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'SSLCommerz IPN error' },
      { status: 500 }
    );
  }
}

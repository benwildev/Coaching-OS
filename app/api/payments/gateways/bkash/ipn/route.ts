import { NextResponse } from 'next/server';
import { verifyAndCompletePayment } from '@/lib/services/payment-gateway.service';
import { PaymentGatewayProviderType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const queryMerchantTxId = url.searchParams.get('merchantTxId');
    const queryCenterId = url.searchParams.get('centerId');

    const body = (await req.json().catch(() => ({}))) as Record<string, string | undefined>;
    const merchantTxId = queryMerchantTxId || body.merchantTxId || body.merchantInvoiceNumber;
    const centerId = queryCenterId || body.centerId;

    if (!merchantTxId || !centerId) {
      return NextResponse.json({ success: false, error: 'Missing merchantTxId or centerId' }, { status: 400 });
    }

    const result = await verifyAndCompletePayment({
      coachingCenterId: centerId,
      providerType: PaymentGatewayProviderType.BKASH,
      merchantTransactionId: merchantTxId,
      rawParams: body,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'IPN processing error' },
      { status: 500 }
    );
  }
}

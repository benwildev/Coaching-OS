import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { testGatewayConfig } from '@/lib/services/payment-gateway.service';
import { PaymentGatewayProviderType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('settings.payment_gateways.update');

    const { provider } = await params;
    const providerUpper = provider.toUpperCase() as PaymentGatewayProviderType;

    if (!Object.values(PaymentGatewayProviderType).includes(providerUpper)) {
      return NextResponse.json(
        { success: false, error: `Invalid payment gateway provider: ${provider}` },
        { status: 400 }
      );
    }

    const testRes = await testGatewayConfig(coachingCenterId, providerUpper, user.userId);
    return NextResponse.json({ success: testRes.success, message: testRes.message });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/payment-gateways/[provider]/test POST');
  }
}

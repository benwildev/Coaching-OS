import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { toggleGatewayConfig } from '@/lib/services/payment-gateway.service';
import { PaymentGatewayProviderType } from '@prisma/client';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const toggleSchema = z.object({
  isEnabled: z.boolean(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const { provider } = await params;
    const providerUpper = provider.toUpperCase() as PaymentGatewayProviderType;

    if (!Object.values(PaymentGatewayProviderType).includes(providerUpper)) {
      return NextResponse.json(
        { success: false, error: `Invalid payment gateway provider: ${provider}` },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = toggleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid toggle payload' },
        { status: 400 }
      );
    }

    const updated = await toggleGatewayConfig(
      coachingCenterId,
      providerUpper,
      parsed.data.isEnabled,
      user.userId
    );

    return NextResponse.json({ success: true, config: updated });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/payment-gateways/[provider]/toggle POST');
  }
}

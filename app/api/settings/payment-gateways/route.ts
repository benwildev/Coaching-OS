import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { getGatewayConfigs, upsertGatewayConfig } from '@/lib/services/payment-gateway.service';
import { PaymentGatewayProviderType } from '@prisma/client';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateGatewayConfigSchema = z.object({
  provider: z.nativeEnum(PaymentGatewayProviderType),
  isEnabled: z.boolean().optional(),
  isSandbox: z.boolean().optional(),
  credentials: z.record(z.string(), z.string().optional()).optional(),
});

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    await requirePermission('settings.payment_gateways.read');

    const configs = await getGatewayConfigs(coachingCenterId);
    return NextResponse.json({ success: true, configs });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/payment-gateways GET');
  }
}

export async function PUT(req: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('settings.payment_gateways.update');

    const body = await req.json();
    const parsed = updateGatewayConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid gateway configuration payload' },
        { status: 400 }
      );
    }

    const updated = await upsertGatewayConfig(
      coachingCenterId,
      {
        provider: parsed.data.provider,
        isEnabled: parsed.data.isEnabled,
        isSandbox: parsed.data.isSandbox,
        credentials: parsed.data.credentials,
      },
      user.userId
    );

    return NextResponse.json({ success: true, config: updated });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/payment-gateways PUT');
  }
}

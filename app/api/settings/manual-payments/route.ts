import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import {
  getManualPaymentInstructions,
  upsertManualPaymentInstruction,
} from '@/lib/services/payment-gateway.service';
import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const manualInstructionSchema = z.object({
  paymentMethod: z.nativeEnum(PaymentMethod),
  accountType: z.string().max(50).optional(),
  accountNumber: z.string().max(100).optional(),
  bankName: z.string().max(100).optional(),
  branchName: z.string().max(100).optional(),
  routingNumber: z.string().max(50).optional(),
  accountTitle: z.string().max(100).optional(),
  instructions: z.string().max(1000).optional(),
  instructionsBn: z.string().max(1000).optional(),
  isEnabled: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

export async function GET() {
  try {
    const { coachingCenterId } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);

    const instructions = await getManualPaymentInstructions(coachingCenterId);
    return NextResponse.json({ success: true, instructions });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/manual-payments GET');
  }
}

export async function PUT(req: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN']);

    const body = await req.json();
    const parsed = manualInstructionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid manual payment instruction payload' },
        { status: 400 }
      );
    }

    const updated = await upsertManualPaymentInstruction(coachingCenterId, parsed.data, user.userId);
    return NextResponse.json({ success: true, instruction: updated });
  } catch (error) {
    return apiErrorResponse(error, '/api/settings/manual-payments PUT');
  }
}

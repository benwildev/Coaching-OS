import { NextResponse } from 'next/server';
import { setupPasswordSchema } from '@/lib/validations/portal-auth';
import { completeSetupOrReset } from '@/lib/services/portal-auth.service';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = setupPasswordSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    await completeSetupOrReset(parsed.data.token, parsed.data.password);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/auth/setup-password POST');
  }
}

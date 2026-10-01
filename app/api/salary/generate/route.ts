import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { generateSalary } from '@/lib/services/salary.service';
import { salaryGenerateSchema } from '@/lib/validations/salary';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const body = await request.json().catch(() => null);
    const parsed = salaryGenerateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const result = await generateSalary(coachingCenterId, user, parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/salary/generate POST');
  }
}

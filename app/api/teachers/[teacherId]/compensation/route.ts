import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { createCompensation, listTeacherCompensation } from '@/lib/services/compensation.service';
import { compensationCreateSchema } from '@/lib/validations/salary';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    const { teacherId } = await props.params;
    const result = await listTeacherCompensation(coachingCenterId, user, teacherId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId]/compensation GET');
  }
}

export async function POST(request: Request, props: { params: Promise<{ teacherId: string }> }) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('compensation.manage');
    const { teacherId } = await props.params;
    const body = await request.json().catch(() => null);
    const parsed = compensationCreateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);
    const compensation = await createCompensation(coachingCenterId, user, teacherId, parsed.data);
    return NextResponse.json({ success: true, compensation }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, '/api/teachers/[teacherId]/compensation POST');
  }
}

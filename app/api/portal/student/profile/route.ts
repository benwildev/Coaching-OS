import { NextResponse } from 'next/server';
import { requireStudentPortal } from '@/lib/auth/portal-session';
import { getStudentProfile, updateStudentProfile } from '@/lib/services/portal-profile.service';
import { studentProfileUpdateSchema } from '@/lib/validations/portal-auth';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireStudentPortal();
    const student = await getStudentProfile(session);
    return NextResponse.json({ success: true, student });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/profile GET');
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireStudentPortal();
    const body = await request.json().catch(() => null);
    const parsed = studentProfileUpdateSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const student = await updateStudentProfile(session, parsed.data);
    return NextResponse.json({ success: true, student });
  } catch (error) {
    return apiErrorResponse(error, '/api/portal/student/profile PATCH');
  }
}

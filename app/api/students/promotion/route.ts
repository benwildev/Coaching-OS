import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { promoteStudents } from '@/lib/services/promotion.service';
import { promoteStudentsSchema } from '@/lib/validations/bulk-student';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requireRole(['OWNER', 'ADMIN', 'STAFF']);
    const body = await request.json().catch(() => null);
    const parsed = promoteStudentsSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const results = await promoteStudents(coachingCenterId, user, parsed.data);
    const successful = results.filter((r) => r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({ success: true, results, summary: { successful, skipped, failed, total: results.length } });
  } catch (error) {
    return apiErrorResponse(error, '/api/students/promotion POST');
  }
}

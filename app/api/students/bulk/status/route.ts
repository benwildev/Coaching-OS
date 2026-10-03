import { NextResponse } from 'next/server';
import { requireTenant, requirePermission } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { bulkUpdateStudentStatus } from '@/lib/services/student.service';
import { bulkStatusChangeSchema } from '@/lib/validations/bulk-student';

export const dynamic = 'force-dynamic';

// Bulk status change is OWNER/ADMIN/STAFF only (students.archive; same default holders as the
// existing /api/students routes). Authorization (tenant + branch) is
// re-verified per student inside bulkUpdateStudentStatus — an unauthorized
// id in the selection is reported as a failure for that id only, never
// silently skipped or allowed to abort the authorized rows.
export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('students.archive');
    const body = await request.json().catch(() => null);
    const parsed = bulkStatusChangeSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const results = await bulkUpdateStudentStatus(coachingCenterId, user, parsed.data);
    const successful = results.filter((r) => r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({ success: true, results, summary: { successful, skipped, failed, total: results.length } });
  } catch (error) {
    return apiErrorResponse(error, '/api/students/bulk/status POST');
  }
}

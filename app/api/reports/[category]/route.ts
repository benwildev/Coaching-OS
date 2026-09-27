import { NextResponse } from 'next/server';
import { requireTenant } from '@/lib/auth/session';
import { apiErrorResponse, validationErrorResponse } from '@/lib/api-error';
import { parseReportFilters } from '@/lib/reports/filters';
import { isReportCategory, runReport } from '@/lib/reports/run-report';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ category: string }> }) {
  try {
    const { user } = await requireTenant();
    const { category } = await params;
    if (!isReportCategory(category)) throw new Error('REPORT_NOT_FOUND');

    const parsed = parseReportFilters(new URL(request.url).searchParams);
    if (!parsed.success) return validationErrorResponse(parsed.error.flatten().fieldErrors);

    const output = await runReport(user, category, parsed.data, {
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    if (output.kind === 'csv') {
      return new NextResponse(output.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${output.filename}"`,
          'Cache-Control': 'no-store',
          'X-Row-Count': String(output.rowCount),
        },
      });
    }
    return NextResponse.json({ success: true, data: output.data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiErrorResponse(error, 'GET /api/reports');
  }
}

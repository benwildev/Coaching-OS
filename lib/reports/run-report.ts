import type { SessionUser } from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/services/audit.service';
import { REPORT_CATEGORIES, resolveReportScope, type ReportCategory } from './access';
import { toCsv, csvFilename } from './csv';
import type { ReportFilters } from './filters';
import { REPORT_VIEWS } from './registry';

export function isReportCategory(value: string): value is ReportCategory {
  return (REPORT_CATEGORIES as string[]).includes(value);
}

export type ReportOutput =
  | { kind: 'json'; data: unknown }
  | { kind: 'csv'; body: string; filename: string; rowCount: number };

/**
 * The single entry point every report request goes through:
 * authenticated session → tenant (from the session only) → role/category
 * permission → branch + teacher scope → validated filters → report service.
 * Used by the API route and by scripts/verify-phase10.ts.
 */
export async function runReport(
  user: SessionUser,
  category: ReportCategory,
  filters: ReportFilters,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<ReportOutput> {
  const def = REPORT_VIEWS[category][filters.view];
  if (!def) throw new Error('INVALID_REPORT_VIEW');
  const forExport = filters.format === 'csv';
  if (forExport && !def.csv) throw new Error('EXPORT_NOT_AVAILABLE');

  const scope = await resolveReportScope(user.coachingCenterId, user, category, filters);
  const result = await def.handler({ scope, filters, forExport });

  if (!forExport) return { kind: 'json', data: result.data };
  if (!result.export) throw new Error('EXPORT_NOT_AVAILABLE');

  const body = toCsv(result.export.columns, result.export.rows);
  const rowCount = result.export.rows.length;
  // Audit the export itself — the filters used and how many rows left the
  // system, never the row data.
  const { format: _format, lang: _lang, page: _page, pageSize: _pageSize, ...usedFilters } = filters;
  await recordAuditLog({
    coachingCenterId: user.coachingCenterId,
    userId: user.userId,
    action: 'REPORT_EXPORTED',
    entity: 'Report',
    entityId: `${category}:${filters.view}`,
    details: { category, view: filters.view, rowCount, filters: { ...usedFilters, branchId: scope.branchId ?? null } },
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent ?? null,
  });
  return { kind: 'csv', body, rowCount, filename: csvFilename(category, filters.view, filters.dateFrom, filters.dateTo) };
}

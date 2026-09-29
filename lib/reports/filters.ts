import { z } from 'zod';

/**
 * Server-side validation for every report filter. Tenant is NEVER accepted
 * from the client; branchId is accepted only as a *request* that
 * resolveReportScope() re-authorizes.
 */

const id = z.string().uuid();
const token = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reportFilterSchema = z.object({
  view: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).default('summary'),
  format: z.enum(['json', 'csv']).default('json'),
  lang: z.enum(['en', 'bn']).default('bn'),

  academicSessionId: id.optional(),
  branchId: id.optional(),
  programId: id.optional(),
  classId: id.optional(),
  groupId: id.optional(),
  courseId: id.optional(),
  batchId: id.optional(),
  subjectId: id.optional(),
  teacherId: id.optional(),
  examId: id.optional(),
  studentId: id.optional(),

  status: token.optional(),
  method: token.optional(),
  channel: token.optional(),
  event: token.optional(),
  examType: token.optional(),
  adjustmentType: z.enum(['DISCOUNT', 'WAIVER']).optional(),
  resultScope: z.enum(['published', 'internal']).default('published'),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
  compare: z.enum(['none', 'previous']).default('none'),
  overdueOnly: z.enum(['true', 'false']).optional(),

  dateFrom: ymd.optional(),
  dateTo: ymd.optional(),

  search: z.string().trim().max(100).optional(),
  // Phase 10.10: "export selected students" from the directory's bulk
  // toolbar — a comma-separated id list, narrowing (never widening) whatever
  // the view would otherwise return. Bounded the same as every other bulk
  // selection in this phase.
  studentIds: z.string().max(12000).optional(),
  sort: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ReportFilters = z.infer<typeof reportFilterSchema>;

/** Parses URLSearchParams, dropping empty values and the "all" sentinel. */
export function parseReportFilters(searchParams: URLSearchParams) {
  const raw: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    const v = value.trim();
    if (v && v !== 'all') raw[key] = v;
  });
  return reportFilterSchema.safeParse(raw);
}

export const EXPORT_ROW_LIMIT = 10000;

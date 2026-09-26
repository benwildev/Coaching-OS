import { z } from 'zod';

export const NOTICE_AUDIENCES = [
  'ALL_CENTER',
  'BRANCH',
  'CLASS',
  'GROUP',
  'BATCH',
  'TEACHERS',
  'STUDENTS',
  'GUARDIANS',
  'STAFF',
] as const;

export const NOTICE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const noticeFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  banglaTitle: optionalText,
  content: z.string().trim().min(1, 'Content is required'),
  banglaContent: optionalText,
  targetAudience: z.enum(NOTICE_AUDIENCES, { message: 'INVALID_NOTICE_AUDIENCE' }),
  branchId: optionalText,
  academicSessionId: optionalText,
  academicProgramId: optionalText,
  academicClassId: optionalText,
  academicGroupId: optionalText,
  batchId: optionalText,
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

/**
 * A notice must carry the scope its audience implies — e.g. a BATCH notice
 * needs a batchId, a BRANCH notice needs a branchId — so the recipient
 * resolver never has to guess (AGENTS.md §15: "Do not allow invalid
 * targeting combinations").
 */
export function checkNoticeAudienceScope(n: {
  targetAudience: string;
  branchId?: string | null;
  academicClassId?: string | null;
  academicGroupId?: string | null;
  batchId?: string | null;
}): string | null {
  if (n.targetAudience === 'BRANCH' && !n.branchId) return 'INVALID_NOTICE_AUDIENCE: a branch is required';
  if (n.targetAudience === 'CLASS' && !n.academicClassId) return 'INVALID_NOTICE_AUDIENCE: a class is required';
  if (n.targetAudience === 'GROUP' && !n.academicGroupId) return 'INVALID_NOTICE_AUDIENCE: a group is required';
  if (n.targetAudience === 'BATCH' && !n.batchId) return 'INVALID_NOTICE_AUDIENCE: a batch is required';
  return null;
}

export const createNoticeSchema = noticeFieldsSchema.superRefine((d, ctx) => {
  const err = checkNoticeAudienceScope(d);
  if (err) ctx.addIssue({ code: 'custom', path: ['targetAudience'], message: err });
});

export const updateNoticeSchema = createNoticeSchema;

export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>;

export interface NoticeFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  targetAudience?: string;
  branchId?: string;
}

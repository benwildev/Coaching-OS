import { z } from 'zod';
import { hasBangla, hasEnglish } from '../format';

export const HOMEWORK_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'] as const;
export const SUBMISSION_STATUSES = ['SUBMITTED', 'LATE', 'REVIEWED', 'RETURNED'] as const;

export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const optionalBanglaText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((v) => !v || !hasEnglish(v), {
    message: 'Bangla field must not contain English characters (বাংলায় লিখুন)',
  })
  .transform((v) => (v ? v : null));

/** http(s) URL or a site-relative path (e.g. "/uploads/..."). Nothing else. */
const resourceUrl = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v) || /^\/[^\s/][^\s]*$/.test(v), {
    message: 'Must be an http(s) URL or a site-relative path',
  });

const homeworkFieldsSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .refine((v) => !hasBangla(v), {
        message: 'Homework title (English) must be in English. Bangla characters are not allowed.',
      }),
    banglaTitle: optionalBanglaText,
    description: optionalText,
    banglaDescription: optionalBanglaText,
    batchId: z.string().trim().min(1, 'Batch is required'),
    subjectId: z.string().trim().min(1, 'Subject is required'),
    fileUrl: resourceUrl,
    publishAt: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || !Number.isNaN(Date.parse(v)), { message: 'Invalid publish date/time' }),
    dueAt: z
      .string()
      .trim()
      .min(1, 'Deadline is required')
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Invalid deadline date/time' }),
    status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  })
  .superRefine((d, ctx) => {
    // Only checked when the teacher states an explicit publishAt — an
    // immediate publish (no publishAt) has no stated "publish date" to
    // violate, and a past dueAt is a legitimate way to record/track a
    // historical or already-overdue assignment (AGENTS.md Phase 10.7 §6:
    // "unless the existing product explicitly supports immediate expiry").
    if (!d.publishAt) return;
    const due = Date.parse(d.dueAt);
    const from = Date.parse(d.publishAt);
    if (due < from) {
      ctx.addIssue({ code: 'custom', path: ['dueAt'], message: 'Deadline cannot be before the publish date/time' });
    }
  });

export const createHomeworkSchema = homeworkFieldsSchema;
export const updateHomeworkSchema = homeworkFieldsSchema;

export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;
export type UpdateHomeworkInput = z.infer<typeof updateHomeworkSchema>;

export interface HomeworkFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  batchId?: string;
  subjectId?: string;
}

export const submitHomeworkSchema = z
  .object({
    content: optionalText,
    fileUrl: resourceUrl,
  })
  .superRefine((d, ctx) => {
    if (!d.content && !d.fileUrl) {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'SUBMISSION_CONTENT_REQUIRED: a text answer or an attachment is required' });
    }
  });

export type SubmitHomeworkInput = z.infer<typeof submitHomeworkSchema>;

export const reviewSubmissionSchema = z
  .object({
    // Deliberately NOT normalized to null when absent (unlike optionalText
    // elsewhere) — the service must be able to tell "feedback omitted,
    // leave it untouched" (undefined) apart from "feedback explicitly
    // cleared" (empty string), so a status-only review doesn't blank out
    // previously written feedback.
    feedback: z.string().trim().optional(),
    status: z.enum(['REVIEWED', 'RETURNED']).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.feedback === undefined && d.status === undefined) {
      ctx.addIssue({ code: 'custom', path: ['status'], message: 'Provide feedback and/or a review status' });
    }
  });

export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;

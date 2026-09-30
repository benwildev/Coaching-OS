import { z } from 'zod';
import { hasBangla, hasEnglish } from '../format';
import { BILLING_TYPES } from '../course-pricing';

export const COURSE_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

export const courseSchema = z.object({
  name: z
    .string()
    .min(2, 'Course name is required')
    .max(150)
    .refine((val) => !hasBangla(val), {
      message: 'Course name (English) must be in English. Bangla characters are not allowed.',
    }),
  banglaName: z
    .string()
    .max(150)
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || !hasEnglish(val), {
      message: 'Course name (Bangla) must be in Bangla. English letters are not allowed.',
    }),
  code: z
    .string()
    .min(2, 'Course code is required')
    .max(40)
    .refine((val) => !hasBangla(val), {
      message: 'Course code must be in English alphanumeric characters.',
    }),
  description: z.string().max(2000).optional().or(z.literal('')),
  academicProgramId: z.string().min(1, 'Academic program is required'),
  academicClassId: z.string().min(1, 'Academic class is required'),
  academicGroupId: z.string().optional().or(z.literal('')),
  durationMonths: z.number().int().min(1).max(60).default(12),
  fee: z.number().min(0).default(0),
  status: z.enum(COURSE_STATUSES).default('ACTIVE'),
});

export type CourseInput = z.infer<typeof courseSchema>;

export const courseUpdateSchema = courseSchema.partial();
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;

// Phase 11.2: Course "Fee & Payment Plan". English names must not contain
// Bangla script and vice versa, matching the rest of the course form.
const feeLabelEn = z
  .string()
  .trim()
  .min(1, 'Fee name is required')
  .max(100)
  .refine((v) => !hasBangla(v), { message: 'Fee name (English) must be in English.' });
const feeLabelBn = z
  .string()
  .trim()
  .max(100)
  .optional()
  .nullable()
  .refine((v) => !v || !hasEnglish(v), { message: 'Fee name (Bangla) must be in Bangla.' });

export const coursePricingSchema = z.object({
  fee: z.number().min(0).max(10_000_000),
  billingType: z.enum(BILLING_TYPES).default('ONE_TIME'),
  additionalFees: z
    .array(
      z.object({
        id: z.string().optional(),
        name: feeLabelEn,
        banglaName: feeLabelBn,
        amount: z.number().gt(0, 'Amount must be greater than zero').max(10_000_000),
        isRequired: z.boolean().default(true),
        isActive: z.boolean().default(true),
      })
    )
    .max(30)
    .default([]),
  installments: z
    .array(
      z.object({
        name: feeLabelEn,
        banglaName: feeLabelBn,
        amount: z.number().gt(0, 'Amount must be greater than zero').max(10_000_000),
        dueAfterDays: z.number().int().min(0).max(1825).default(0),
      })
    )
    .max(24)
    .default([]),
});

export type CoursePricingInput = z.infer<typeof coursePricingSchema>;

export const courseSubjectSchema = z.object({
  subjectId: z.string().min(1, 'Subject is required'),
  subjectPaperId: z.string().optional().or(z.literal('')),
  displayOrder: z.number().int().min(0).default(0),
  isMandatory: z.boolean().default(true),
  totalMarks: z.number().min(0).max(1000).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type CourseSubjectInput = z.infer<typeof courseSubjectSchema>;

export const courseSubjectsReplaceSchema = z.object({
  subjects: z.array(courseSubjectSchema).default([]),
});

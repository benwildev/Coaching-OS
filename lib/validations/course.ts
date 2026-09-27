import { z } from 'zod';
import { hasBangla, hasEnglish } from '../format';

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

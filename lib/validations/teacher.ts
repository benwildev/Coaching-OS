import { z } from 'zod';
import { isValidBdPhone } from './student';
import { hasBangla, hasEnglish } from '../format';
import { isHttpOrRelativeUrl, RESOURCE_URL_MESSAGE } from './common';

export const TEACHER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export const teacherBaseSchema = z.object({
  branchId: z.string().optional().or(z.literal('')),
  name: z
    .string()
    .trim()
    .min(2, 'Teacher name (English) is required (at least 2 characters)')
    .max(100)
    .refine((val) => !hasBangla(val), {
      message: 'Teacher name (English) must be in English. Bangla characters are not allowed.',
    }),
  banglaName: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || !hasEnglish(val), {
      message: 'Teacher Bangla name must be in Bangla. English letters are not allowed.',
    }),
  phone: z
    .string()
    .trim()
    .min(1, 'Phone number is required')
    .refine((val) => isValidBdPhone(val), {
      message: 'Invalid Bangladeshi mobile number (must be 11 digits starting with 01, e.g. 01712XXXXXX)',
    }),
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: 'Invalid email address',
    }),
  designation: z.string().trim().max(100).optional().or(z.literal('')),
  qualification: z.string().trim().max(200).optional().or(z.literal('')),
  bio: z.string().trim().max(1000).optional().or(z.literal('')),
  photoUrl: z.string().trim().optional().or(z.literal('')).refine(isHttpOrRelativeUrl, { message: RESOURCE_URL_MESSAGE }),
  status: z.enum(TEACHER_STATUSES).default('ACTIVE'),
  joiningDate: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid joining date format',
    }),
  subjectIds: z.array(z.string()).default([]),
  teachingAssignments: z
    .array(
      z.object({
        courseId: z.string().trim().min(1, 'Course is required'),
        batchId: z.string().trim().min(1, 'Batch is required'),
        subjectIds: z.array(z.string().trim().min(1)).min(1, 'At least one subject must be selected for each batch'),
        startDate: z.string().optional().or(z.literal('')),
        endDate: z.string().optional().or(z.literal('')),
      })
    )
    .default([]),
  createLoginAccount: z.boolean().optional(),
});

export const teacherSchema = teacherBaseSchema.superRefine((data, ctx) => {
  if (data.createLoginAccount === true && (!data.email || !data.email.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Email address is required to create a teacher login account',
      path: ['email'],
    });
  }
});

export type TeachingAssignmentInput = z.infer<typeof teacherSchema>['teachingAssignments'][number];
export type TeacherInput = z.input<typeof teacherSchema>;
export type TeacherOutput = z.infer<typeof teacherSchema>;
export const teacherUpdateSchema = teacherBaseSchema.partial();
export type TeacherUpdateInput = z.infer<typeof teacherUpdateSchema>;

export const teacherAssignmentCreateSchema = z.object({
  courseId: z.string().trim().min(1, 'Course is required'),
  batchId: z.string().trim().min(1, 'Batch is required'),
  subjectIds: z.array(z.string().trim().min(1)).min(1, 'At least one subject must be selected'),
  startDate: z.string().optional().or(z.literal('')),
  endDate: z.string().optional().or(z.literal('')),
});
export type TeacherAssignmentCreateInput = z.infer<typeof teacherAssignmentCreateSchema>;

export const teacherAssignmentUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'ENDED']).optional(),
  endDate: z.string().optional().or(z.literal('')),
});
export type TeacherAssignmentUpdateInput = z.infer<typeof teacherAssignmentUpdateSchema>;

// Phase 10.5: OWNER/ADMIN-only teacher <-> login account linking.
export const teacherAccountLinkSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('create'),
    name: z.string().trim().min(2, 'Name is required'),
    banglaName: z.string().trim().max(100).optional().or(z.literal('')),
    email: z.string().trim().email('Enter a valid email address'),
    phone: z.string().trim().refine((val) => isValidBdPhone(val), { message: 'Enter a valid Bangladesh phone number' }),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
  z.object({
    mode: z.literal('link'),
    userId: z.string().min(1, 'Select an account to link'),
  }),
]);
export type TeacherAccountLinkInput = z.infer<typeof teacherAccountLinkSchema>;

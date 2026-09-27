import { z } from 'zod';
import { hasBangla, hasEnglish } from '../format';

const englishName = (label: string) =>
  z
    .string()
    .min(2, `${label} is required`)
    .refine((val) => !hasBangla(val), {
      message: `${label} (English) must be in English. Bangla characters are not allowed.`,
    });

const banglaName = (label: string) =>
  z
    .string()
    .optional()
    .refine((val) => !val || !hasEnglish(val), {
      message: `${label} (Bangla) must be in Bangla. English letters are not allowed.`,
    });

export const academicSessionSchema = z.object({
  name: englishName('Session name'),
  banglaName: banglaName('Session name'),
  startDate: z.string().min(4, 'Start date is required'),
  endDate: z.string().min(4, 'End date is required'),
  isCurrent: z.boolean().default(false),
});

export const academicProgramSchema = z.object({
  name: englishName('Program name'),
  banglaName: banglaName('Program name'),
  code: z.string().min(2, 'Program code is required'),
  description: z.string().optional(),
});

export const academicClassSchema = z.object({
  academicProgramId: z.string().uuid(),
  name: englishName('Class name'),
  banglaName: banglaName('Class name'),
  code: z.string().min(2, 'Class code is required'),
  order: z.number().int().default(0),
});

export const academicGroupSchema = z.object({
  academicClassId: z.string().uuid(),
  name: englishName('Group name'),
  banglaName: banglaName('Group name'),
  code: z.string().min(2, 'Group code is required'),
});

export const subjectSchema = z.object({
  academicClassId: z.string().uuid(),
  academicGroupId: z.string().uuid().optional(),
  name: englishName('Subject name'),
  banglaName: banglaName('Subject name'),
  code: z.string().min(2, 'Subject code is required'),
});

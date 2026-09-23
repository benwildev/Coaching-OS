import { z } from 'zod';

export const academicSessionSchema = z.object({
  name: z.string().min(2, 'Session name is required'),
  banglaName: z.string().optional(),
  startDate: z.string().min(4, 'Start date is required'),
  endDate: z.string().min(4, 'End date is required'),
  isCurrent: z.boolean().default(false),
});

export const academicProgramSchema = z.object({
  name: z.string().min(2, 'Program name is required'),
  banglaName: z.string().optional(),
  code: z.string().min(2, 'Program code is required'),
  description: z.string().optional(),
});

export const academicClassSchema = z.object({
  academicProgramId: z.string().uuid(),
  name: z.string().min(2, 'Class name is required'),
  banglaName: z.string().optional(),
  code: z.string().min(2, 'Class code is required'),
  order: z.number().int().default(0),
});

export const academicGroupSchema = z.object({
  academicClassId: z.string().uuid(),
  name: z.string().min(2, 'Group name is required'),
  banglaName: z.string().optional(),
  code: z.string().min(2, 'Group code is required'),
});

export const subjectSchema = z.object({
  academicClassId: z.string().uuid(),
  academicGroupId: z.string().uuid().optional(),
  name: z.string().min(2, 'Subject name is required'),
  banglaName: z.string().optional(),
  code: z.string().min(2, 'Subject code is required'),
});

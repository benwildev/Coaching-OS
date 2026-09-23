import { z } from 'zod';

export const BATCH_STATUSES = ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;
export const STUDENT_BATCH_STATUSES = ['ACTIVE', 'TRANSFERRED', 'DROPPED'] as const;
export const BATCH_TEACHER_STATUSES = ['ACTIVE', 'ENDED'] as const;

export const batchSchema = z.object({
  name: z.string().min(2, 'Batch name is required').max(150),
  banglaName: z.string().max(150).optional().or(z.literal('')),
  code: z.string().min(2, 'Batch code is required').max(40),
  description: z.string().max(2000).optional().or(z.literal('')),
  branchId: z.string().min(1, 'Branch is required'),
  academicSessionId: z.string().min(1, 'Academic session is required'),
  academicProgramId: z.string().min(1, 'Academic program is required'),
  academicClassId: z.string().min(1, 'Academic class is required'),
  academicGroupId: z.string().optional().or(z.literal('')),
  courseId: z.string().optional().or(z.literal('')),
  capacity: z.number().int().min(1).max(500).default(40),
  startDate: z.string().optional().or(z.literal('')),
  endDate: z.string().optional().or(z.literal('')),
  status: z.enum(BATCH_STATUSES).default('PLANNED'),
  // subject ids inherited/selected from the course at creation time; user may edit
  subjectIds: z.array(z.string()).default([]),
});

export type BatchInput = z.infer<typeof batchSchema>;
export const batchUpdateSchema = batchSchema.partial().omit({ subjectIds: true });
export type BatchUpdateInput = z.infer<typeof batchUpdateSchema>;

export const batchSubjectsUpdateSchema = z.object({
  subjectIds: z.array(z.string()).default([]),
});

export const studentBatchAssignSchema = z.object({
  studentId: z.string().min(1, 'Student is required'),
  startDate: z.string().optional().or(z.literal('')),
  rollCode: z.string().max(40).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
  overrideCapacity: z.boolean().default(false),
});
export type StudentBatchAssignInput = z.infer<typeof studentBatchAssignSchema>;

export const studentBatchUpdateSchema = z.object({
  status: z.enum(STUDENT_BATCH_STATUSES).optional(),
  endDate: z.string().optional().or(z.literal('')),
  rollCode: z.string().max(40).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
});
export type StudentBatchUpdateInput = z.infer<typeof studentBatchUpdateSchema>;

export const batchTeacherAssignSchema = z.object({
  teacherId: z.string().min(1, 'Teacher is required'),
  subjectId: z.string().min(1, 'Subject is required'),
  startDate: z.string().optional().or(z.literal('')),
  endDate: z.string().optional().or(z.literal('')),
});
export type BatchTeacherAssignInput = z.infer<typeof batchTeacherAssignSchema>;

export const batchTeacherUpdateSchema = z.object({
  status: z.enum(BATCH_TEACHER_STATUSES).optional(),
  endDate: z.string().optional().or(z.literal('')),
});
export type BatchTeacherUpdateInput = z.infer<typeof batchTeacherUpdateSchema>;

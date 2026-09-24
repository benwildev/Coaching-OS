import { z } from 'zod';

export const EXAM_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  ONGOING: 'ONGOING',
  COMPLETED: 'COMPLETED',
  PUBLISHED: 'PUBLISHED',
  CANCELLED: 'CANCELLED',
} as const;

export type ExamStatusType = (typeof EXAM_STATUS)[keyof typeof EXAM_STATUS];

export const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['ONGOING', 'DRAFT', 'CANCELLED'],
  ONGOING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['PUBLISHED', 'ONGOING'],
  PUBLISHED: ['ONGOING', 'COMPLETED'], // Elevated role + audit required
  CANCELLED: [],
};

export const EXAM_TYPES = [
  'WEEKLY',
  'MONTHLY',
  'MODEL_TEST',
  'TERM_FINAL',
  'ADMISSION_MOCK',
  'CHAPTER_TEST',
] as const;

export const examSubjectInputSchema = z
  .object({
    subjectId: z.string().min(1, 'Subject is required'),
    examDate: z.string().optional().or(z.literal('')),
    startTime: z.string().optional().or(z.literal('')),
    durationMinutes: z.number().int().min(5, 'Duration must be at least 5 minutes').max(600).default(60),
    totalMarks: z.number().positive('Total marks must be greater than zero').max(1000).default(100),
    passMarks: z.number().min(0, 'Pass marks must be at least 0').max(1000).default(40),
  })
  .refine((data) => data.passMarks <= data.totalMarks, {
    message: 'Pass marks cannot exceed total marks',
    path: ['passMarks'],
  });

export type ExamSubjectInput = z.infer<typeof examSubjectInputSchema>;

export const createExamSchema = z
  .object({
    title: z.string().min(2, 'Exam title must be at least 2 characters').max(150),
    banglaTitle: z.string().max(150).optional().or(z.literal('')),
    examType: z.string().min(1, 'Exam type is required').default('WEEKLY'),
    academicSessionId: z.string().min(1, 'Academic session is required'),
    academicProgramId: z.string().min(1, 'Academic program is required'),
    academicClassId: z.string().min(1, 'Academic class is required'),
    academicGroupId: z.string().optional().or(z.literal('')),
    batchId: z.string().optional().or(z.literal('')),
    branchId: z.string().optional().or(z.literal('')),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().optional().or(z.literal('')),
    totalMarks: z.number().positive('Total marks must be greater than zero').default(100),
    passMarks: z.number().min(0, 'Pass marks must be at least 0').default(40),
    subjects: z.array(examSubjectInputSchema).min(1, 'At least one exam subject is required'),
    selectionMode: z.enum(['ALL_ELIGIBLE', 'SELECTED']).default('ALL_ELIGIBLE'),
    studentIds: z.array(z.string()).optional().default([]),
  })
  .refine((data) => data.passMarks <= data.totalMarks, {
    message: 'Pass marks cannot exceed total marks',
    path: ['passMarks'],
  });

export type CreateExamInput = z.infer<typeof createExamSchema>;

export const updateExamSchema = z
  .object({
    title: z.string().min(2).max(150).optional(),
    banglaTitle: z.string().max(150).optional().or(z.literal('')),
    examType: z.string().optional(),
    academicGroupId: z.string().optional().or(z.literal('')),
    batchId: z.string().optional().or(z.literal('')),
    startDate: z.string().optional(),
    endDate: z.string().optional().or(z.literal('')),
    totalMarks: z.number().positive().optional(),
    passMarks: z.number().min(0).optional(),
  })
  .refine(
    (data) => {
      if (data.totalMarks !== undefined && data.passMarks !== undefined) {
        return data.passMarks <= data.totalMarks;
      }
      return true;
    },
    {
      message: 'Pass marks cannot exceed total marks',
      path: ['passMarks'],
    }
  );

export type UpdateExamInput = z.infer<typeof updateExamSchema>;

export const transitionExamStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'PUBLISHED', 'CANCELLED']),
  reason: z.string().optional(),
  allowIncomplete: z.boolean().optional().default(false),
});

export type TransitionExamStatusInput = z.infer<typeof transitionExamStatusSchema>;

export const addExamSubjectSchema = examSubjectInputSchema;
export type AddExamSubjectInput = z.infer<typeof addExamSubjectSchema>;

export const updateExamSubjectSchema = z
  .object({
    examDate: z.string().optional().or(z.literal('')),
    startTime: z.string().optional().or(z.literal('')),
    durationMinutes: z.number().int().min(5).max(600).optional(),
    totalMarks: z.number().positive().optional(),
    passMarks: z.number().min(0).optional(),
  })
  .refine(
    (data) => {
      if (data.totalMarks !== undefined && data.passMarks !== undefined) {
        return data.passMarks <= data.totalMarks;
      }
      return true;
    },
    {
      message: 'Pass marks cannot exceed total marks',
      path: ['passMarks'],
    }
  );

export type UpdateExamSubjectInput = z.infer<typeof updateExamSubjectSchema>;

export const enrollStudentsSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1, 'Please select at least one student'),
});

export type EnrollStudentsInput = z.infer<typeof enrollStudentsSchema>;

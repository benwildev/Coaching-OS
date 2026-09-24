import { z } from 'zod';

export const RESULT_STATUS = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  EXCUSED: 'EXCUSED',
} as const;

export type ResultStatusType = (typeof RESULT_STATUS)[keyof typeof RESULT_STATUS];

export const resultEntrySchema = z
  .object({
    studentId: z.string().min(1, 'Student ID is required'),
    status: z.enum(['PRESENT', 'ABSENT', 'EXCUSED']).default('PRESENT'),
    marksObtained: z
      .number()
      .min(0, 'Marks cannot be negative')
      .max(1000, 'Marks exceed maximum allowed')
      .nullable()
      .optional(),
    remarks: z.string().max(300).optional().nullable(),
  })
  .refine(
    (data) => {
      // If student is PRESENT, marksObtained must be specified and not null
      if (data.status === 'PRESENT' && (data.marksObtained === null || data.marksObtained === undefined)) {
        return false;
      }
      return true;
    },
    {
      message: 'Marks obtained is required for present students',
      path: ['marksObtained'],
    }
  );

export type ResultEntryInput = z.infer<typeof resultEntrySchema>;

export const bulkResultsSaveSchema = z.object({
  results: z.array(resultEntrySchema).min(1, 'At least one result record is required'),
});

export type BulkResultsSaveInput = z.infer<typeof bulkResultsSaveSchema>;

export const resultFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  examId: z.string().optional(),
  studentId: z.string().optional(),
  batchId: z.string().optional(),
  academicSessionId: z.string().optional(),
  academicProgramId: z.string().optional(),
  academicClassId: z.string().optional(),
  academicGroupId: z.string().optional(),
  branchId: z.string().optional(),
  examType: z.string().optional(),
  status: z.string().optional(),
  isPassed: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ResultFilterParams = z.infer<typeof resultFilterSchema>;

import { z } from 'zod';

export const QUESTION_PAPER_STATUSES = ['DRAFT', 'FINALIZED', 'ARCHIVED'] as const;
export type QuestionPaperStatus = (typeof QUESTION_PAPER_STATUSES)[number];

/** Same exam type vocabulary as the Phase 6 exam module. */
export const PAPER_EXAM_TYPES = [
  'WEEKLY',
  'MONTHLY',
  'MODEL_TEST',
  'TERM_FINAL',
  'ADMISSION_MOCK',
  'CHAPTER_TEST',
] as const;

export const MAX_PAPER_ITEMS = 200;

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const optionalId = optionalText;

const paperFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  banglaTitle: optionalText,
  academicSessionId: optionalId,
  academicProgramId: optionalId,
  academicClassId: optionalId,
  academicGroupId: optionalId,
  subjectId: z.string().trim().min(1, 'Subject is required'),
  subjectPaperId: optionalId,
  examType: z.enum(PAPER_EXAM_TYPES).optional().nullable(),
  examDate: optionalText,
  durationMinutes: z.coerce.number().int().positive('Duration must be greater than 0').max(600),
  /** Declared total. When omitted it is taken from the selected questions. */
  totalMarks: z.coerce.number().positive().max(9999).optional().nullable(),
  instructions: optionalText,
  banglaInstructions: optionalText,
  /** Ordered list of question ids — array position is the paper order. */
  questionIds: z.array(z.string().trim().min(1)).max(MAX_PAPER_ITEMS).default([]),
});

function noDuplicates(ids: string[]) {
  return new Set(ids).size === ids.length;
}

export const createQuestionPaperSchema = paperFieldsSchema
  .refine((d) => d.questionIds.length > 0, {
    path: ['questionIds'],
    message: 'Select at least one question',
  })
  .refine((d) => noDuplicates(d.questionIds), {
    path: ['questionIds'],
    message: 'QUESTION_ALREADY_SELECTED',
  });

export const updateQuestionPaperSchema = paperFieldsSchema
  .partial()
  .refine((d) => !d.questionIds || d.questionIds.length > 0, {
    path: ['questionIds'],
    message: 'Select at least one question',
  })
  .refine((d) => !d.questionIds || noDuplicates(d.questionIds), {
    path: ['questionIds'],
    message: 'QUESTION_ALREADY_SELECTED',
  });

export type CreateQuestionPaperInput = z.infer<typeof createQuestionPaperSchema>;
export type UpdateQuestionPaperInput = z.infer<typeof updateQuestionPaperSchema>;

export interface QuestionPaperFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  subjectId?: string;
  academicClassId?: string;
}

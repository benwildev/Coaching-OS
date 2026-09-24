import { z } from 'zod';

export const QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'SHORT', 'WRITTEN', 'CQ', 'FILL_BLANK'] as const;
export const QUESTION_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export const QUESTION_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/** Question types whose answer is chosen from a fixed list of options. */
export const OPTION_QUESTION_TYPES: readonly QuestionType[] = ['MCQ', 'TRUE_FALSE'];

export const MIN_MCQ_OPTIONS = 2;
export const MAX_MCQ_OPTIONS = 8;

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const optionalId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const questionOptionSchema = z.object({
  optionText: z.string().trim().min(1, 'Option text is required'),
  banglaOptionText: optionalText,
  isCorrect: z.boolean().default(false),
});

const questionBaseSchema = z.object({
  academicSessionId: optionalId,
  academicProgramId: optionalId,
  academicClassId: optionalId,
  academicGroupId: optionalId,
  subjectId: z.string().trim().min(1, 'Subject is required'),
  subjectPaperId: optionalId,
  chapter: optionalText,
  type: z.enum(QUESTION_TYPES, { message: 'INVALID_QUESTION_TYPE' }),
  difficulty: z.enum(QUESTION_DIFFICULTIES).default('MEDIUM'),
  marks: z.coerce.number().positive('Marks must be greater than 0').max(99.99, 'Marks are too large'),
  questionText: z.string().trim().min(1, 'Question text is required'),
  banglaQuestionText: optionalText,
  answer: optionalText,
  banglaAnswer: optionalText,
  explanation: optionalText,
  banglaExplanation: optionalText,
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  options: z.array(questionOptionSchema).max(MAX_MCQ_OPTIONS).default([]),
});

export type QuestionOptionInput = z.infer<typeof questionOptionSchema>;

/**
 * Option rules shared by the create/update schemas and the service-level
 * publish guard, so the same rule is never implemented twice.
 * Returns an error code, or null when valid.
 */
export function checkQuestionOptions(
  type: string,
  options: Array<{ optionText: string; isCorrect: boolean }>
): string | null {
  if (!OPTION_QUESTION_TYPES.includes(type as QuestionType)) {
    return options.length > 0 ? 'NON_MCQ_OPTIONS_NOT_ALLOWED' : null;
  }
  if (options.length < MIN_MCQ_OPTIONS) return 'INVALID_MCQ_OPTIONS: at least 2 options are required';
  if (options.some((o) => !o.optionText?.trim())) return 'INVALID_MCQ_OPTIONS: option text cannot be empty';
  const correct = options.filter((o) => o.isCorrect).length;
  if (correct !== 1) return 'INVALID_MCQ_OPTIONS: exactly one correct option is required';
  const texts = options.map((o) => o.optionText.trim().toLowerCase());
  if (new Set(texts).size !== texts.length) return 'INVALID_MCQ_OPTIONS: options must be unique';
  return null;
}

export const createQuestionSchema = questionBaseSchema.superRefine((data, ctx) => {
  const err = checkQuestionOptions(data.type, data.options);
  if (err) ctx.addIssue({ code: 'custom', path: ['options'], message: err });
});

export const updateQuestionSchema = createQuestionSchema;

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export interface QuestionFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: string;
  difficulty?: string;
  status?: string;
  subjectId?: string;
  subjectPaperId?: string;
  academicClassId?: string;
  academicGroupId?: string;
  chapter?: string;
  createdById?: string;
  /** Excludes these ids (used by the paper builder to hide already-selected questions). */
  excludeIds?: string[];
  /** Hide archived questions unless explicitly requested via status. */
  includeArchived?: boolean;
}

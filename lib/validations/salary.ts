import { z } from 'zod';
import { PAYMENT_METHODS } from './payment';

export const COMPENSATION_TYPES = ['MONTHLY_FIXED', 'PER_BATCH', 'PER_CLASS', 'CUSTOM'] as const;
export type CompensationType = (typeof COMPENSATION_TYPES)[number];

/** Money with at most two decimals, strictly positive. */
const money = z
  .number({ error: 'Amount is required' })
  .positive('Amount must be greater than zero')
  .max(10_000_000, 'Amount is too large')
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Amount can have at most two decimals');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const compensationCreateSchema = z
  .object({
    type: z.enum(COMPENSATION_TYPES),
    amount: money,
    // PER_BATCH / PER_CLASS: the teacher's own BatchTeacherAssignment. Never a free batch/subject id.
    assignmentId: z.string().min(1).optional(),
    // Only used for MONTHLY_FIXED / CUSTOM when the teacher has no home branch.
    branchId: z.string().min(1).optional(),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.optional().nullable(),
    notes: z.string().max(500).optional().or(z.literal('')),
  })
  .superRefine((v, ctx) => {
    const needsAssignment = v.type === 'PER_BATCH' || v.type === 'PER_CLASS';
    if (needsAssignment && !v.assignmentId) {
      ctx.addIssue({ code: 'custom', path: ['assignmentId'], message: 'Select the course, batch and subject' });
    }
    if (!needsAssignment && v.assignmentId) {
      ctx.addIssue({ code: 'custom', path: ['assignmentId'], message: 'Only per-batch and per-class pay use a teaching assignment' });
    }
    if (v.effectiveTo && v.effectiveTo < v.effectiveFrom) {
      ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'End date cannot be before the start date' });
    }
  });
export type CompensationCreateInput = z.infer<typeof compensationCreateSchema>;

// Type, teacher and assignment are immutable: pay-model changes end the old rule and add a new one.
export const compensationUpdateSchema = z
  .object({
    amount: money.optional(),
    effectiveFrom: isoDate.optional(),
    effectiveTo: isoDate.nullable().optional(),
    notes: z.string().max(500).optional().or(z.literal('')),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type CompensationUpdateInput = z.infer<typeof compensationUpdateSchema>;

export const compensationEndSchema = z.object({
  effectiveTo: isoDate.optional(),
});
export type CompensationEndInput = z.infer<typeof compensationEndSchema>;

export const salaryGenerateSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  branchId: z.string().min(1).optional(),
});
export type SalaryGenerateInput = z.infer<typeof salaryGenerateSchema>;

export const salaryPaymentSchema = z.object({
  amount: money,
  paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
  paymentDate: isoDate.optional(),
  transactionId: z.string().max(100).optional().or(z.literal('')),
  referenceNumber: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
  // One per "Pay" attempt, resent unchanged on retry so a double-submit is a no-op.
  idempotencyKey: z.string().max(100).optional().or(z.literal('')),
});
export type SalaryPaymentInput = z.infer<typeof salaryPaymentSchema>;

export const salaryCancelSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(300),
});
export type SalaryCancelInput = z.infer<typeof salaryCancelSchema>;

import { z } from 'zod';
import { PAYMENT_METHODS } from '@/lib/services/finance-overview.service';

export const expensePaymentMethodEnum = z.enum(PAYMENT_METHODS);

export const createExpenseSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  branchId: z.string().min(1, 'Branch is required'),
  categoryId: z.string().min(1, 'Category is required'),
  amount: z
    .number()
    .positive('Amount must be greater than 0')
    .max(100_000_000, 'Amount cannot exceed 100,000,000')
    .refine((v) => Number(v.toFixed(2)) === v, 'Amount cannot have more than 2 decimal places'),
  paymentMethod: expensePaymentMethodEnum,
  paidTo: z.string().trim().max(200, 'Paid to cannot exceed 200 characters').nullable().optional(),
  invoiceNo: z.string().trim().max(100, 'Invoice / reference number cannot exceed 100 characters').nullable().optional(),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').nullable().optional(),
  idempotencyKey: z.string().trim().max(100).nullable().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  categoryId: z.string().min(1, 'Category is required').optional(),
  amount: z
    .number()
    .positive('Amount must be greater than 0')
    .max(100_000_000, 'Amount cannot exceed 100,000,000')
    .refine((v) => Number(v.toFixed(2)) === v, 'Amount cannot have more than 2 decimal places')
    .optional(),
  paymentMethod: expensePaymentMethodEnum.optional(),
  paidTo: z.string().trim().max(200, 'Paid to cannot exceed 200 characters').nullable().optional(),
  invoiceNo: z.string().trim().max(100, 'Invoice / reference number cannot exceed 100 characters').nullable().optional(),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').nullable().optional(),
});

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const cancelExpenseSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Cancellation reason must be at least 3 characters')
    .max(500, 'Cancellation reason cannot exceed 500 characters'),
});

export type CancelExpenseInput = z.infer<typeof cancelExpenseSchema>;

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name cannot exceed 100 characters'),
  banglaName: z.string().trim().max(100, 'Bangla name cannot exceed 100 characters').nullable().optional(),
});

export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;

export const updateExpenseCategorySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name cannot exceed 100 characters').optional(),
  banglaName: z.string().trim().max(100, 'Bangla name cannot exceed 100 characters').nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;

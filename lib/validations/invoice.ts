import { z } from 'zod';

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'] as const;

export const invoiceItemInputSchema = z.object({
  studentFeeAssignmentId: z.string().optional().or(z.literal('')),
  description: z.string().min(1, 'Description is required').max(200),
  quantity: z.number().int().min(1).max(1000).default(1),
  unitAmount: z.number().min(0).max(100000000),
  discountAmount: z.number().min(0).max(100000000).default(0),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;

export const invoiceCreateSchema = z.object({
  studentId: z.string().min(1, 'Student is required'),
  branchId: z.string().optional().or(z.literal('')),
  invoiceDate: z.string().optional().or(z.literal('')),
  dueDate: z.string().optional().or(z.literal('')),
  items: z.array(invoiceItemInputSchema).min(1, 'At least one invoice item is required'),
  discountAmount: z.number().min(0).max(100000000).default(0),
  waiverAmount: z.number().min(0).max(100000000).default(0),
  notes: z.string().max(1000).optional().or(z.literal('')),
  issueNow: z.boolean().default(true),
});
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;

export const invoiceUpdateSchema = z.object({
  dueDate: z.string().optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;

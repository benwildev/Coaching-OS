import { z } from 'zod';

export const PAYMENT_METHODS = ['CASH', 'BKASH', 'NAGAD', 'BANK', 'CARD', 'OTHER'] as const;
export const PAYMENT_STATUSES = ['COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED'] as const;

export const paymentCreateSchema = z.object({
  amount: z.number().positive('Amount must be greater than zero').max(100000000),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
  paymentDate: z.string().optional().or(z.literal('')),
  transactionId: z.string().max(100).optional().or(z.literal('')),
  referenceNumber: z.string().max(100).optional().or(z.literal('')),
  senderMobile: z.string().max(20).optional().or(z.literal('')),
  bankName: z.string().max(120).optional().or(z.literal('')),
  chequeNumber: z.string().max(60).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
});
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

export const paymentRefundSchema = z.object({
  amount: z.number().positive('Refund amount must be greater than zero').max(100000000),
  reason: z.string().min(3, 'Reason is required').max(300),
  referenceNumber: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
});
export type PaymentRefundInput = z.infer<typeof paymentRefundSchema>;

import { z } from 'zod';

export const cashSessionOpenSchema = z.object({
  branchId: z.string().uuid(),
  openingCash: z.number().min(0).max(100000000),
});
export type CashSessionOpenInput = z.infer<typeof cashSessionOpenSchema>;

export const cashSessionCloseSchema = z.object({
  countedCash: z.number().min(0).max(100000000),
  note: z.string().max(500).optional().or(z.literal('')),
});
export type CashSessionCloseInput = z.infer<typeof cashSessionCloseSchema>;

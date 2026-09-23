import { z } from 'zod';

export const FEE_TYPES = [
  'ADMISSION',
  'MONTHLY',
  'COURSE',
  'BATCH',
  'EXAM',
  'MODEL_TEST',
  'MATERIAL',
  'SPECIAL_CLASS',
  'REGISTRATION',
  'OTHER',
] as const;

export const FEE_FREQUENCIES = ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM'] as const;

export const FEE_ASSIGNMENT_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'WAIVED', 'CANCELLED'] as const;

export const feeStructureSchema = z.object({
  name: z.string().min(2, 'Fee structure name is required').max(150),
  banglaName: z.string().max(150).optional().or(z.literal('')),
  code: z.string().max(40).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  feeType: z.enum(FEE_TYPES).default('MONTHLY'),
  amount: z.number().positive('Amount must be greater than zero').max(100000000),
  frequency: z.enum(FEE_FREQUENCIES).default('MONTHLY'),
  dueDay: z.number().int().min(1).max(28).default(10),
  lateFee: z.number().min(0).max(10000000).default(0),
  branchId: z.string().optional().or(z.literal('')),
  academicSessionId: z.string().optional().or(z.literal('')),
  academicClassId: z.string().optional().or(z.literal('')),
  courseId: z.string().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});
export type FeeStructureInput = z.infer<typeof feeStructureSchema>;

export const feeStructureUpdateSchema = feeStructureSchema.partial();
export type FeeStructureUpdateInput = z.infer<typeof feeStructureUpdateSchema>;

export const feeStructureStatusSchema = z.object({
  isActive: z.boolean(),
});
export type FeeStructureStatusInput = z.infer<typeof feeStructureStatusSchema>;

export const studentFeeAssignSchema = z
  .object({
    feeStructureId: z.string().optional().or(z.literal('')),
    batchId: z.string().optional().or(z.literal('')),
    academicSessionId: z.string().optional().or(z.literal('')),
    name: z.string().min(2, 'Fee name is required').max(150),
    description: z.string().max(1000).optional().or(z.literal('')),
    originalAmount: z.number().positive('Amount must be greater than zero').max(100000000),
    discountAmount: z.number().min(0).max(100000000).default(0),
    waiverAmount: z.number().min(0).max(100000000).default(0),
    dueDate: z.string().optional().or(z.literal('')),
    reason: z.string().max(300).optional().or(z.literal('')),
  })
  .refine((d) => d.discountAmount + d.waiverAmount <= d.originalAmount, {
    message: 'Discount and waiver combined cannot exceed the original fee amount',
    path: ['discountAmount'],
  });
export type StudentFeeAssignInput = z.infer<typeof studentFeeAssignSchema>;

// Discount/waiver-vs-originalAmount bounds are re-checked server-side in the
// service layer against the stored originalAmount (not knowable here).
export const studentFeeAssignmentUpdateSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  description: z.string().max(1000).optional().or(z.literal('')),
  discountAmount: z.number().min(0).max(100000000).optional(),
  waiverAmount: z.number().min(0).max(100000000).optional(),
  dueDate: z.string().optional().or(z.literal('')),
  status: z.enum(FEE_ASSIGNMENT_STATUSES).optional(),
  reason: z.string().max(300).optional().or(z.literal('')),
});
export type StudentFeeAssignmentUpdateInput = z.infer<typeof studentFeeAssignmentUpdateSchema>;

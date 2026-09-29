import { z } from 'zod';
import { STUDENT_STATUSES } from './student';
import { CERTIFICATE_TYPES } from '@/lib/services/certificate.service';

// Bulk operations are bounded — never allow one synchronous request to
// process an unbounded selection (AGENTS.md Phase 10.10 §34/§41).
const MAX_BULK_IDS = 300;
const studentIdList = z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS);

export const bulkStatusChangeSchema = z.object({
  studentIds: studentIdList,
  newStatus: z.enum(STUDENT_STATUSES),
  reason: z.string().max(300).optional(),
});
export type BulkStatusChangeInput = z.infer<typeof bulkStatusChangeSchema>;

export const bulkBatchTransferSchema = z.object({
  studentIds: studentIdList,
  destinationBatchId: z.string().uuid(),
  overrideCapacity: z.boolean().optional(),
  overrideConflict: z.boolean().optional(),
});
export type BulkBatchTransferInput = z.infer<typeof bulkBatchTransferSchema>;

export const promotionCandidatesQuerySchema = z.object({
  sourceSessionId: z.string().uuid(),
  sourceClassId: z.string().uuid().optional(),
  sourceGroupId: z.string().uuid().optional(),
  sourceBatchId: z.string().uuid().optional(),
});
export type PromotionCandidatesQuery = z.infer<typeof promotionCandidatesQuerySchema>;

export const promoteStudentsSchema = z.object({
  studentIds: studentIdList,
  sourceSessionId: z.string().uuid(),
  destinationSessionId: z.string().uuid(),
  destinationProgramId: z.string().uuid(),
  destinationClassId: z.string().uuid(),
  destinationGroupId: z.string().uuid().optional(),
  destinationCourseId: z.string().uuid().optional(),
  destinationBatchId: z.string().uuid(),
  overrideCapacity: z.boolean().optional(),
});
export type PromoteStudentsInput = z.infer<typeof promoteStudentsSchema>;

export const idCardsBulkSchema = z.object({
  studentIds: studentIdList,
});

export const issueCertificateSchema = z.object({
  type: z.enum(CERTIFICATE_TYPES),
});

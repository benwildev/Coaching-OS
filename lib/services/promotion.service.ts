import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { assertBranchAccess, type SessionUser } from '@/lib/auth/session';
import { recordAuditLog } from './audit.service';
import { assertBatchHasCapacity } from './batch.service';
import type { StudentBulkOpResult } from './bulk-types';

/**
 * Academic promotion (Phase 10.10). The schema has no "next session" chain
 * (AcademicSession rows are independent, ordered only by startDate — see
 * audit) so the destination session/class/group/course/batch are always
 * explicitly chosen by the caller, never inferred.
 *
 * A promotion never destroys history: the student's enrollment for the
 * *source* session is flipped to COMPLETED (never deleted), a brand new
 * ENROLLED StudentEnrollment row is created for the destination session, and
 * the StudentBatch transfer reuses the exact same status+endDate lifecycle
 * (and the same assertBatchHasCapacity advisory lock) as every other batch
 * assignment in this codebase.
 */

export interface PromotionCandidateParams {
  sourceSessionId: string;
  sourceClassId?: string;
  sourceGroupId?: string;
  sourceBatchId?: string;
  branchId?: string; // already resolved by the caller (resolveEffectiveBranchId)
}

export async function getPromotionCandidates(coachingCenterId: string, params: PromotionCandidateParams) {
  const enrollmentWhere: Prisma.StudentEnrollmentWhereInput = {
    academicSessionId: params.sourceSessionId,
    status: 'ENROLLED',
  };
  if (params.sourceClassId) enrollmentWhere.academicClassId = params.sourceClassId;
  if (params.sourceGroupId) enrollmentWhere.academicGroupId = params.sourceGroupId;

  const where: Prisma.StudentWhereInput = {
    coachingCenterId,
    ...(params.branchId ? { branchId: params.branchId } : {}),
    enrollments: { some: enrollmentWhere },
    ...(params.sourceBatchId ? { studentBatches: { some: { batchId: params.sourceBatchId, status: 'ACTIVE' } } } : {}),
  };

  return prisma.student.findMany({
    where,
    select: {
      id: true,
      studentIdCode: true,
      name: true,
      banglaName: true,
      status: true,
      branchId: true,
      enrollments: {
        where: enrollmentWhere,
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, academicClassId: true, academicGroupId: true, courseId: true },
      },
      studentBatches: {
        where: { status: 'ACTIVE' },
        select: { batch: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: 'asc' },
    take: 500, // this is a review list for a human to select from, not an export
  });
}

export interface PromoteStudentsInput {
  studentIds: string[];
  sourceSessionId: string;
  destinationSessionId: string;
  destinationProgramId: string;
  destinationClassId: string;
  destinationGroupId?: string;
  destinationCourseId?: string;
  destinationBatchId: string;
  overrideCapacity?: boolean;
}

export async function promoteStudents(
  coachingCenterId: string,
  user: SessionUser,
  input: PromoteStudentsInput
): Promise<StudentBulkOpResult[]> {
  const [destSession, destClass, destBatch] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: input.destinationSessionId, coachingCenterId } }),
    prisma.academicClass.findFirst({ where: { id: input.destinationClassId, coachingCenterId } }),
    prisma.batch.findFirst({ where: { id: input.destinationBatchId, coachingCenterId } }),
  ]);
  if (!destSession) throw new Error('DESTINATION_SESSION_NOT_FOUND');
  if (!destClass) throw new Error('DESTINATION_CLASS_NOT_FOUND');
  if (!destBatch) throw new Error('DESTINATION_BATCH_NOT_FOUND');
  assertBranchAccess(user, destBatch.branchId);

  const results: StudentBulkOpResult[] = [];

  for (const studentId of input.studentIds) {
    try {
      const student = await prisma.student.findFirst({ where: { id: studentId, coachingCenterId } });
      if (!student) {
        results.push({ studentId, success: false, reason: 'STUDENT_NOT_FOUND' });
        continue;
      }
      assertBranchAccess(user, student.branchId);

      // Duplicate-promotion prevention: never create a second active
      // enrollment for a student already promoted into this session.
      const alreadyEnrolled = await prisma.studentEnrollment.findFirst({
        where: { studentId, academicSessionId: input.destinationSessionId, status: 'ENROLLED' },
        select: { id: true },
      });
      if (alreadyEnrolled) {
        results.push({ studentId, success: true, skipped: true, reason: 'ALREADY_ENROLLED_IN_DESTINATION_SESSION' });
        continue;
      }

      const sourceEnrollment = await prisma.studentEnrollment.findFirst({
        where: { studentId, academicSessionId: input.sourceSessionId, status: 'ENROLLED' },
        select: { id: true, academicClassId: true },
      });
      const currentActiveBatch = await prisma.studentBatch.findFirst({
        where: { studentId, status: 'ACTIVE' },
        select: { batchId: true },
      });

      // Everything below happens in ONE transaction per student — a
      // half-created promotion (enrolled in the new class but not the new
      // batch, or vice versa) must never be possible (AGENTS.md §27).
      const newEnrollment = await prisma.$transaction(async (tx) => {
        if (sourceEnrollment) {
          await tx.studentEnrollment.update({ where: { id: sourceEnrollment.id }, data: { status: 'COMPLETED' } });
        }

        const created = await tx.studentEnrollment.create({
          data: {
            coachingCenterId,
            studentId,
            branchId: student.branchId,
            academicSessionId: input.destinationSessionId,
            academicProgramId: input.destinationProgramId,
            academicClassId: input.destinationClassId,
            academicGroupId: input.destinationGroupId || null,
            courseId: input.destinationCourseId || null,
            admissionDate: new Date(),
            status: 'ENROLLED',
          },
        });

        if (!currentActiveBatch || currentActiveBatch.batchId !== input.destinationBatchId) {
          await assertBatchHasCapacity(tx, input.destinationBatchId, destBatch.capacity, input.overrideCapacity);
          if (currentActiveBatch) {
            // No single-row unique key to target (only a partial unique
            // index on (studentId, batchId) WHERE status='ACTIVE') — scope
            // the close to this specific old batch via updateMany.
            await tx.studentBatch.updateMany({
              where: { studentId, batchId: currentActiveBatch.batchId, status: 'ACTIVE' },
              data: { status: 'TRANSFERRED', endDate: new Date() },
            });
          }
          await tx.studentBatch.create({
            data: { coachingCenterId, studentId, batchId: input.destinationBatchId, joinedAt: new Date(), status: 'ACTIVE' },
          });
        }

        return created;
      });

      await recordAuditLog({
        coachingCenterId,
        userId: user.userId,
        action: 'STUDENT_PROMOTED',
        entity: 'StudentEnrollment',
        entityId: newEnrollment.id,
        details: {
          fromSessionId: input.sourceSessionId,
          fromClassId: sourceEnrollment?.academicClassId ?? null,
          fromBatchId: currentActiveBatch?.batchId ?? null,
          toSessionId: input.destinationSessionId,
          toClassId: input.destinationClassId,
          toBatchId: input.destinationBatchId,
        },
      });

      results.push({ studentId, success: true });
    } catch (error) {
      results.push({ studentId, success: false, reason: error instanceof Error ? error.message : 'UNKNOWN_ERROR' });
    }
  }

  return results;
}

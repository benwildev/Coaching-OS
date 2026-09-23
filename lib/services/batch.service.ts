import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import type {
  BatchInput,
  BatchUpdateInput,
  StudentBatchAssignInput,
  StudentBatchUpdateInput,
  BatchTeacherAssignInput,
  BatchTeacherUpdateInput,
} from '@/lib/validations/batch';
import type { Prisma } from '@prisma/client';

export interface BatchFilterParams {
  search?: string;
  branchId?: string;
  sessionId?: string;
  programId?: string;
  classId?: string;
  groupId?: string;
  courseId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

export async function getBatchesList(coachingCenterId: string, params: BatchFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.BatchWhereInput = { coachingCenterId };
  if (params.branchId && params.branchId !== 'all') where.branchId = params.branchId;
  if (params.sessionId && params.sessionId !== 'all') where.academicSessionId = params.sessionId;
  if (params.programId && params.programId !== 'all') where.academicProgramId = params.programId;
  if (params.classId && params.classId !== 'all') where.academicClassId = params.classId;
  if (params.groupId && params.groupId !== 'all') where.academicGroupId = params.groupId;
  if (params.courseId && params.courseId !== 'all') where.courseId = params.courseId;
  if (params.status && params.status !== 'all') where.status = params.status;

  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { banglaName: { contains: q } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, batches] = await Promise.all([
    prisma.batch.count({ where }),
    prisma.batch.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        academicSession: { select: { id: true, name: true } },
        academicProgram: { select: { id: true, name: true, banglaName: true } },
        academicClass: { select: { id: true, name: true, banglaName: true } },
        academicGroup: { select: { id: true, name: true, banglaName: true } },
        course: { select: { id: true, name: true, banglaName: true } },
        batchTeacherAssignments: {
          where: { status: 'ACTIVE' },
          include: {
            teacher: { select: { id: true, name: true, banglaName: true } },
            subject: { select: { id: true, name: true } },
          },
        },
        classSchedules: {
          where: { status: 'ACTIVE' },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        _count: { select: { studentBatches: { where: { status: 'ACTIVE' } } } },
      },
    }),
  ]);

  return {
    batches,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getBatchById(coachingCenterId: string, batchId: string) {
  const batch = await prisma.batch.findFirst({
    where: { id: batchId, coachingCenterId },
    include: {
      branch: true,
      academicSession: true,
      academicProgram: true,
      academicClass: true,
      academicGroup: true,
      course: {
        include: { courseSubjects: { include: { subject: true }, orderBy: { displayOrder: 'asc' } } },
      },
      batchSubjects: { include: { subject: true }, orderBy: { displayOrder: 'asc' } },
      batchTeacherAssignments: {
        include: {
          teacher: { select: { id: true, name: true, banglaName: true, phone: true } },
          subject: { select: { id: true, name: true, banglaName: true } },
        },
        orderBy: { startDate: 'desc' },
      },
      classSchedules: {
        include: {
          subject: { select: { id: true, name: true, banglaName: true } },
          teacher: { select: { id: true, name: true, banglaName: true } },
          room: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      },
      // All statuses fetched once; split into active vs. full history below so
      // the same relation isn't queried twice.
      studentBatches: {
        include: {
          student: {
            select: { id: true, studentIdCode: true, name: true, banglaName: true, phone: true, status: true },
          },
        },
        orderBy: { joinedAt: 'desc' },
      },
    },
  });

  if (!batch) return null;

  const { studentBatches, ...rest } = batch;
  return {
    ...rest,
    studentBatches: studentBatches.filter((sb) => sb.status === 'ACTIVE'),
    studentBatchHistory: studentBatches,
    activeStudentCount: studentBatches.filter((sb) => sb.status === 'ACTIVE').length,
  };
}

/** Active enrollment count for a batch, computed live (never stored). */
export async function getBatchActiveStudentCount(batchId: string): Promise<number> {
  return prisma.studentBatch.count({ where: { batchId, status: 'ACTIVE' } });
}

export async function createBatch(coachingCenterId: string, input: BatchInput, actorId?: string) {
  const branch = await prisma.branch.findFirst({ where: { id: input.branchId, coachingCenterId } });
  if (!branch) throw new Error('BRANCH_NOT_FOUND');

  const dupe = await prisma.batch.findFirst({
    where: { coachingCenterId, code: input.code.trim().toUpperCase() },
  });
  if (dupe) throw new Error('A batch with this code already exists in this coaching center');

  if (input.courseId) {
    const course = await prisma.course.findFirst({ where: { id: input.courseId, coachingCenterId } });
    if (!course) throw new Error('COURSE_NOT_FOUND');
  }

  const subjectIds = Array.from(new Set(input.subjectIds || []));
  if (subjectIds.length) {
    const validCount = await prisma.subject.count({ where: { id: { in: subjectIds }, coachingCenterId } });
    if (validCount !== subjectIds.length) throw new Error('One or more subjects are invalid');
  }

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.batch.create({
      data: {
        coachingCenterId,
        branchId: input.branchId,
        academicSessionId: input.academicSessionId,
        academicProgramId: input.academicProgramId,
        academicClassId: input.academicClassId,
        academicGroupId: input.academicGroupId || null,
        courseId: input.courseId || null,
        name: input.name.trim(),
        banglaName: input.banglaName?.trim() || null,
        code: input.code.trim().toUpperCase(),
        description: input.description?.trim() || null,
        capacity: input.capacity ?? 40,
        startDate: toDate(input.startDate),
        endDate: toDate(input.endDate),
        status: input.status ?? 'PLANNED',
      },
    });

    if (subjectIds.length) {
      await tx.batchSubject.createMany({
        data: subjectIds.map((subjectId, idx) => ({
          batchId: created.id,
          subjectId,
          displayOrder: idx,
        })),
      });
    }

    return created;
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'BATCH_CREATED',
    entity: 'Batch',
    entityId: batch.id,
    details: { name: batch.name, code: batch.code, branchId: batch.branchId },
  });

  return batch;
}

export async function updateBatch(
  coachingCenterId: string,
  batchId: string,
  input: BatchUpdateInput,
  actorId?: string
) {
  const existing = await prisma.batch.findFirst({ where: { id: batchId, coachingCenterId } });
  if (!existing) throw new Error('BATCH_NOT_FOUND');

  if (input.code && input.code.trim().toUpperCase() !== existing.code) {
    const dupe = await prisma.batch.findFirst({
      where: { coachingCenterId, code: input.code.trim().toUpperCase(), NOT: { id: batchId } },
    });
    if (dupe) throw new Error('A batch with this code already exists in this coaching center');
  }

  const statusChanged = input.status && input.status !== existing.status;

  const batch = await prisma.batch.update({
    where: { id: batchId },
    data: {
      branchId: input.branchId ?? existing.branchId,
      academicSessionId: input.academicSessionId ?? existing.academicSessionId,
      academicProgramId: input.academicProgramId ?? existing.academicProgramId,
      academicClassId: input.academicClassId ?? existing.academicClassId,
      academicGroupId: input.academicGroupId !== undefined ? input.academicGroupId || null : existing.academicGroupId,
      courseId: input.courseId !== undefined ? input.courseId || null : existing.courseId,
      name: input.name?.trim() ?? existing.name,
      banglaName: input.banglaName !== undefined ? input.banglaName?.trim() || null : existing.banglaName,
      code: input.code ? input.code.trim().toUpperCase() : existing.code,
      description: input.description !== undefined ? input.description?.trim() || null : existing.description,
      capacity: input.capacity ?? existing.capacity,
      startDate: input.startDate !== undefined ? toDate(input.startDate) : existing.startDate,
      endDate: input.endDate !== undefined ? toDate(input.endDate) : existing.endDate,
      status: input.status ?? existing.status,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: statusChanged ? 'BATCH_STATUS_CHANGED' : 'BATCH_UPDATED',
    entity: 'Batch',
    entityId: batch.id,
    details: { name: batch.name, status: batch.status },
  });

  return batch;
}

/** Replaces the batch's subject list (controlled customization vs. the course template). */
export async function replaceBatchSubjects(
  coachingCenterId: string,
  batchId: string,
  subjectIds: string[],
  actorId?: string
) {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, coachingCenterId } });
  if (!batch) throw new Error('BATCH_NOT_FOUND');

  const ids = Array.from(new Set(subjectIds));
  if (ids.length) {
    const validCount = await prisma.subject.count({ where: { id: { in: ids }, coachingCenterId } });
    if (validCount !== ids.length) throw new Error('One or more subjects are invalid');
  }

  await prisma.$transaction(async (tx) => {
    await tx.batchSubject.deleteMany({ where: { batchId } });
    if (ids.length) {
      await tx.batchSubject.createMany({
        data: ids.map((subjectId, idx) => ({ batchId, subjectId, displayOrder: idx })),
      });
    }
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'BATCH_SUBJECTS_UPDATED',
    entity: 'Batch',
    entityId: batchId,
    details: { subjectCount: ids.length },
  });

  return getBatchById(coachingCenterId, batchId);
}

/**
 * Assigns a student to a batch, preserving history (never overwrites past
 * assignments) and enforcing capacity unless explicitly overridden.
 */
export async function assignStudentToBatch(
  coachingCenterId: string,
  batchId: string,
  input: StudentBatchAssignInput,
  actorId?: string
) {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, coachingCenterId } });
  if (!batch) throw new Error('BATCH_NOT_FOUND');
  if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
    throw new Error(`Cannot assign students to a ${batch.status.toLowerCase()} batch`);
  }

  const student = await prisma.student.findFirst({ where: { id: input.studentId, coachingCenterId } });
  if (!student) throw new Error('STUDENT_NOT_FOUND');

  const alreadyActive = await prisma.studentBatch.findFirst({
    where: { studentId: input.studentId, batchId, status: 'ACTIVE' },
  });
  if (alreadyActive) throw new Error('Student is already actively assigned to this batch');

  if (!input.overrideCapacity) {
    const activeCount = await getBatchActiveStudentCount(batchId);
    if (activeCount >= batch.capacity) {
      throw new Error('BATCH_FULL');
    }
  }

  const assignment = await prisma.studentBatch.create({
    data: {
      coachingCenterId,
      studentId: input.studentId,
      batchId,
      joinedAt: toDate(input.startDate) || new Date(),
      rollCode: input.rollCode?.trim() || null,
      notes: input.notes?.trim() || null,
      status: 'ACTIVE',
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'STUDENT_ASSIGNED_TO_BATCH',
    entity: 'StudentBatch',
    entityId: assignment.id,
    details: { studentId: input.studentId, batchId, batchName: batch.name },
  });

  return assignment;
}

export async function updateStudentBatchAssignment(
  coachingCenterId: string,
  studentBatchId: string,
  input: StudentBatchUpdateInput,
  actorId?: string
) {
  const existing = await prisma.studentBatch.findFirst({
    where: { id: studentBatchId, coachingCenterId },
    include: { batch: { select: { id: true, name: true } } },
  });
  if (!existing) throw new Error('ASSIGNMENT_NOT_FOUND');

  const updated = await prisma.studentBatch.update({
    where: { id: studentBatchId },
    data: {
      status: input.status ?? existing.status,
      endDate: input.endDate !== undefined ? toDate(input.endDate) : existing.endDate,
      rollCode: input.rollCode !== undefined ? input.rollCode?.trim() || null : existing.rollCode,
      notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
    },
  });

  const wasRemoved = existing.status === 'ACTIVE' && updated.status !== 'ACTIVE';

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: wasRemoved ? 'STUDENT_REMOVED_FROM_BATCH' : 'STUDENT_BATCH_ASSIGNMENT_UPDATED',
    entity: 'StudentBatch',
    entityId: updated.id,
    details: { batchId: existing.batch.id, batchName: existing.batch.name, status: updated.status },
  });

  return updated;
}

export async function assignTeacherToBatch(
  coachingCenterId: string,
  batchId: string,
  input: BatchTeacherAssignInput,
  actorId?: string
) {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, coachingCenterId } });
  if (!batch) throw new Error('BATCH_NOT_FOUND');

  const teacher = await prisma.teacher.findFirst({ where: { id: input.teacherId, coachingCenterId } });
  if (!teacher) throw new Error('TEACHER_NOT_FOUND');

  const subject = await prisma.subject.findFirst({ where: { id: input.subjectId, coachingCenterId } });
  if (!subject) throw new Error('SUBJECT_NOT_FOUND');

  const dupe = await prisma.batchTeacherAssignment.findFirst({
    where: { batchId, subjectId: input.subjectId, teacherId: input.teacherId, status: 'ACTIVE' },
  });
  if (dupe) throw new Error('This teacher is already assigned to this subject in this batch');

  const assignment = await prisma.batchTeacherAssignment.create({
    data: {
      coachingCenterId,
      branchId: batch.branchId,
      batchId,
      subjectId: input.subjectId,
      teacherId: input.teacherId,
      startDate: toDate(input.startDate) || new Date(),
      endDate: toDate(input.endDate),
      status: 'ACTIVE',
    },
    include: {
      teacher: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'TEACHER_ASSIGNED',
    entity: 'BatchTeacherAssignment',
    entityId: assignment.id,
    details: { batchId, teacherId: input.teacherId, subjectId: input.subjectId },
  });

  return assignment;
}

export async function updateBatchTeacherAssignment(
  coachingCenterId: string,
  assignmentId: string,
  input: BatchTeacherUpdateInput,
  actorId?: string
) {
  const existing = await prisma.batchTeacherAssignment.findFirst({
    where: { id: assignmentId, coachingCenterId },
  });
  if (!existing) throw new Error('ASSIGNMENT_NOT_FOUND');

  const updated = await prisma.batchTeacherAssignment.update({
    where: { id: assignmentId },
    data: {
      status: input.status ?? existing.status,
      endDate: input.endDate !== undefined ? toDate(input.endDate) : existing.endDate,
    },
  });

  const wasRemoved = existing.status === 'ACTIVE' && updated.status !== 'ACTIVE';

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: wasRemoved ? 'TEACHER_REMOVED' : 'TEACHER_ASSIGNMENT_UPDATED',
    entity: 'BatchTeacherAssignment',
    entityId: updated.id,
    details: { batchId: existing.batchId, teacherId: existing.teacherId, status: updated.status },
  });

  return updated;
}

/** Options payload for batch creation/management screens (server-side filtered). */
export async function getBatchFormOptions(coachingCenterId: string) {
  const [branches, sessions, programs, courses, rooms, teachers, batches] = await Promise.all([
    prisma.branch.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      orderBy: { isMain: 'desc' },
      select: { id: true, name: true, banglaName: true, code: true, isMain: true },
    }),
    prisma.academicSession.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true, banglaName: true, isCurrent: true },
    }),
    prisma.academicProgram.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      include: {
        classes: {
          orderBy: { order: 'asc' },
          include: {
            groups: { orderBy: { name: 'asc' } },
            subjects: { orderBy: { name: 'asc' } },
          },
        },
      },
    }),
    prisma.course.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      include: { courseSubjects: { include: { subject: true }, orderBy: { displayOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    }),
    prisma.room.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, branchId: true, capacity: true },
    }),
    prisma.teacher.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, banglaName: true, branchId: true },
    }),
    prisma.batch.findMany({
      where: { coachingCenterId },
      select: {
        id: true,
        name: true,
        banglaName: true,
        code: true,
        branchId: true,
        status: true,
        academicProgramId: true,
        academicClassId: true,
        academicGroupId: true,
        academicSessionId: true,
      },
    }),
  ]);

  return { branches, sessions, programs, courses, rooms, teachers, batches };
}

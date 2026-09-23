import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import type {
  FeeStructureInput,
  FeeStructureUpdateInput,
  StudentFeeAssignInput,
  StudentFeeAssignmentUpdateInput,
} from '@/lib/validations/fee';
import type { Prisma } from '@prisma/client';

function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

function n(value: Prisma.Decimal | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

/** Lightweight lookup used by route handlers to check branch access before mutating a student's fees. */
export async function getStudentBranchId(coachingCenterId: string, studentId: string): Promise<string | null | undefined> {
  const student = await prisma.student.findFirst({ where: { id: studentId, coachingCenterId }, select: { branchId: true } });
  return student?.branchId;
}

/** Lightweight lookup used by route handlers to check branch access before mutating a fee assignment. */
export async function getFeeAssignmentBranchId(coachingCenterId: string, assignmentId: string): Promise<string | null | undefined> {
  const assignment = await prisma.studentFeeAssignment.findFirst({ where: { id: assignmentId, coachingCenterId }, select: { branchId: true } });
  return assignment?.branchId;
}

// ==========================================
// FEE STRUCTURES
// ==========================================

export interface FeeStructureFilterParams {
  search?: string;
  branchId?: string;
  academicSessionId?: string;
  feeType?: string;
  isActive?: string; // 'true' | 'false' | 'all'
  page?: number;
  pageSize?: number;
}

export async function getFeeStructuresList(coachingCenterId: string, params: FeeStructureFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.FeeStructureWhereInput = { coachingCenterId };
  if (params.branchId && params.branchId !== 'all') where.branchId = params.branchId;
  if (params.academicSessionId && params.academicSessionId !== 'all') where.academicSessionId = params.academicSessionId;
  if (params.feeType && params.feeType !== 'all') where.feeType = params.feeType as Prisma.EnumFeeTypeFilter['equals'];
  if (params.isActive === 'true') where.isActive = true;
  else if (params.isActive === 'false') where.isActive = false;

  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { banglaName: { contains: q } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, structures] = await Promise.all([
    prisma.feeStructure.count({ where }),
    prisma.feeStructure.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        academicSession: { select: { id: true, name: true } },
        academicClass: { select: { id: true, name: true, banglaName: true } },
        course: { select: { id: true, name: true, banglaName: true } },
        _count: { select: { feeAssignments: true } },
      },
    }),
  ]);

  return {
    structures,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getFeeStructureById(coachingCenterId: string, feeStructureId: string) {
  return prisma.feeStructure.findFirst({
    where: { id: feeStructureId, coachingCenterId },
    include: {
      branch: true,
      academicSession: true,
      academicClass: true,
      course: true,
      _count: { select: { feeAssignments: true } },
    },
  });
}

export async function createFeeStructure(coachingCenterId: string, input: FeeStructureInput, actorId?: string) {
  if (input.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, coachingCenterId } });
    if (!branch) throw new Error('BRANCH_NOT_FOUND');
  }

  const structure = await prisma.feeStructure.create({
    data: {
      coachingCenterId,
      branchId: input.branchId || null,
      academicSessionId: input.academicSessionId || null,
      academicClassId: input.academicClassId || null,
      courseId: input.courseId || null,
      name: input.name.trim(),
      banglaName: input.banglaName?.trim() || null,
      code: input.code?.trim() || null,
      description: input.description?.trim() || null,
      feeType: input.feeType,
      amount: input.amount,
      frequency: input.frequency,
      dueDay: input.dueDay,
      lateFee: input.lateFee,
      isActive: input.isActive,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'FEE_STRUCTURE_CREATED',
    entity: 'FeeStructure',
    entityId: structure.id,
    details: { name: structure.name, feeType: structure.feeType, amount: n(structure.amount) },
  });

  return structure;
}

export async function updateFeeStructure(
  coachingCenterId: string,
  feeStructureId: string,
  input: FeeStructureUpdateInput,
  actorId?: string
) {
  const existing = await prisma.feeStructure.findFirst({ where: { id: feeStructureId, coachingCenterId } });
  if (!existing) throw new Error('FEE_STRUCTURE_NOT_FOUND');

  if (input.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, coachingCenterId } });
    if (!branch) throw new Error('BRANCH_NOT_FOUND');
  }

  const statusChanged = input.isActive !== undefined && input.isActive !== existing.isActive;

  const structure = await prisma.feeStructure.update({
    where: { id: feeStructureId },
    data: {
      branchId: input.branchId !== undefined ? input.branchId || null : existing.branchId,
      academicSessionId: input.academicSessionId !== undefined ? input.academicSessionId || null : existing.academicSessionId,
      academicClassId: input.academicClassId !== undefined ? input.academicClassId || null : existing.academicClassId,
      courseId: input.courseId !== undefined ? input.courseId || null : existing.courseId,
      name: input.name?.trim() ?? existing.name,
      banglaName: input.banglaName !== undefined ? input.banglaName?.trim() || null : existing.banglaName,
      code: input.code !== undefined ? input.code?.trim() || null : existing.code,
      description: input.description !== undefined ? input.description?.trim() || null : existing.description,
      feeType: input.feeType ?? existing.feeType,
      amount: input.amount ?? existing.amount,
      frequency: input.frequency ?? existing.frequency,
      dueDay: input.dueDay ?? existing.dueDay,
      lateFee: input.lateFee ?? existing.lateFee,
      isActive: input.isActive ?? existing.isActive,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: statusChanged ? 'FEE_STRUCTURE_STATUS_CHANGED' : 'FEE_STRUCTURE_UPDATED',
    entity: 'FeeStructure',
    entityId: structure.id,
    details: { name: structure.name, isActive: structure.isActive },
  });

  return structure;
}

/** Options payload for fee structure / assignment / invoice creation screens. */
export async function getFeeFormOptions(coachingCenterId: string) {
  const [branches, sessions, classes, courses, activeStructures] = await Promise.all([
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
    prisma.academicClass.findMany({
      where: { coachingCenterId },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, banglaName: true, academicProgramId: true },
    }),
    prisma.course.findMany({
      where: { coachingCenterId, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, banglaName: true, fee: true },
    }),
    prisma.feeStructure.findMany({
      where: { coachingCenterId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        banglaName: true,
        feeType: true,
        amount: true,
        frequency: true,
        branchId: true,
        academicSessionId: true,
        academicClassId: true,
        courseId: true,
      },
    }),
  ]);

  return { branches, sessions, classes, courses, activeStructures };
}

// ==========================================
// STUDENT FEE ASSIGNMENTS
// ==========================================

export async function getStudentFeeProfile(coachingCenterId: string, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, coachingCenterId },
    select: {
      id: true,
      studentIdCode: true,
      name: true,
      banglaName: true,
      status: true,
      branch: { select: { id: true, name: true } },
      studentBatches: {
        where: { status: 'ACTIVE' },
        include: { batch: { select: { id: true, name: true, code: true } } },
        take: 1,
      },
    },
  });
  if (!student) return null;

  const [assignments, invoices, payments] = await Promise.all([
    prisma.studentFeeAssignment.findMany({
      where: { studentId, coachingCenterId },
      orderBy: { createdAt: 'desc' },
      include: {
        feeStructure: { select: { id: true, name: true, feeType: true } },
        batch: { select: { id: true, name: true } },
      },
    }),
    prisma.feeInvoice.findMany({
      where: { studentId, coachingCenterId },
      orderBy: { invoiceDate: 'desc' },
      include: { _count: { select: { payments: true } } },
    }),
    prisma.payment.findMany({
      where: { studentId, coachingCenterId },
      orderBy: { paymentDate: 'desc' },
      include: { invoice: { select: { id: true, invoiceNumber: true } }, refunds: true },
    }),
  ]);

  const totalAssigned = assignments.reduce((s, a) => s + n(a.originalAmount), 0);
  const totalDiscount = assignments.reduce((s, a) => s + n(a.discountAmount), 0);
  const totalWaiver = assignments.reduce((s, a) => s + n(a.waiverAmount), 0);
  const totalBilled = invoices
    .filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT')
    .reduce((s, i) => s + n(i.totalAmount), 0);
  const totalPaid = invoices
    .filter((i) => i.status !== 'CANCELLED')
    .reduce((s, i) => s + n(i.paidAmount), 0);
  const totalDue = invoices
    .filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT')
    .reduce((s, i) => s + n(i.dueAmount), 0);

  return {
    student,
    assignments,
    invoices,
    payments,
    summary: {
      totalAssigned,
      totalDiscount,
      totalWaiver,
      totalBilled,
      totalPaid,
      totalDue,
    },
  };
}

export async function assignFeeToStudent(
  coachingCenterId: string,
  studentId: string,
  input: StudentFeeAssignInput,
  actorId?: string
) {
  const student = await prisma.student.findFirst({ where: { id: studentId, coachingCenterId } });
  if (!student) throw new Error('STUDENT_NOT_FOUND');

  if (input.feeStructureId) {
    const fs = await prisma.feeStructure.findFirst({ where: { id: input.feeStructureId, coachingCenterId } });
    if (!fs) throw new Error('FEE_STRUCTURE_NOT_FOUND');
  }
  if (input.batchId) {
    const batch = await prisma.batch.findFirst({ where: { id: input.batchId, coachingCenterId } });
    if (!batch) throw new Error('BATCH_NOT_FOUND');
  }

  // Server recalculates final amount — never trust a client-submitted final amount.
  const finalAmount = Math.max(0, input.originalAmount - input.discountAmount - input.waiverAmount);

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.studentFeeAssignment.create({
      data: {
        coachingCenterId,
        branchId: student.branchId,
        studentId,
        feeStructureId: input.feeStructureId || null,
        batchId: input.batchId || null,
        academicSessionId: input.academicSessionId || null,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        originalAmount: input.originalAmount,
        discountAmount: input.discountAmount,
        waiverAmount: input.waiverAmount,
        finalAmount,
        dueDate: toDate(input.dueDate),
        status: 'PENDING',
        createdById: actorId,
      },
    });

    if (input.discountAmount > 0) {
      await tx.feeDiscount.create({
        data: {
          coachingCenterId,
          studentFeeAssignmentId: created.id,
          type: 'DISCOUNT',
          amount: input.discountAmount,
          reason: input.reason?.trim() || 'Discount applied at assignment',
          createdById: actorId,
        },
      });
    }
    if (input.waiverAmount > 0) {
      await tx.feeDiscount.create({
        data: {
          coachingCenterId,
          studentFeeAssignmentId: created.id,
          type: 'WAIVER',
          amount: input.waiverAmount,
          reason: input.reason?.trim() || 'Waiver applied at assignment',
          createdById: actorId,
        },
      });
    }

    return created;
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'STUDENT_FEE_ASSIGNED',
    entity: 'StudentFeeAssignment',
    entityId: assignment.id,
    details: { studentId, name: assignment.name, finalAmount },
  });

  return assignment;
}

export async function updateStudentFeeAssignment(
  coachingCenterId: string,
  assignmentId: string,
  input: StudentFeeAssignmentUpdateInput,
  actorId?: string
) {
  const existing = await prisma.studentFeeAssignment.findFirst({
    where: { id: assignmentId, coachingCenterId },
    include: { invoiceItems: { include: { invoice: { select: { paidAmount: true, status: true } } } } },
  });
  if (!existing) throw new Error('FEE_ASSIGNMENT_NOT_FOUND');

  const hasBeenBilledOrPaid = existing.invoiceItems.some(
    (item) => item.invoice.status !== 'DRAFT' && item.invoice.status !== 'CANCELLED'
  );
  const hasPayments = existing.invoiceItems.some((item) => n(item.invoice.paidAmount) > 0);

  const changingAmounts = input.discountAmount !== undefined || input.waiverAmount !== undefined;
  if (changingAmounts && hasPayments) {
    throw new Error('Cannot change discount/waiver on a fee assignment that already has recorded payments');
  }

  if (input.status === 'CANCELLED') {
    if (hasBeenBilledOrPaid) {
      throw new Error('Cannot cancel a fee assignment that has already been invoiced');
    }
  }

  const discountAmount = input.discountAmount ?? n(existing.discountAmount);
  const waiverAmount = input.waiverAmount ?? n(existing.waiverAmount);
  const originalAmount = n(existing.originalAmount);
  if (discountAmount + waiverAmount > originalAmount) {
    throw new Error('Discount and waiver combined cannot exceed the original fee amount');
  }
  const finalAmount = Math.max(0, originalAmount - discountAmount - waiverAmount);

  const assignment = await prisma.$transaction(async (tx) => {
    const updated = await tx.studentFeeAssignment.update({
      where: { id: assignmentId },
      data: {
        name: input.name?.trim() ?? existing.name,
        description: input.description !== undefined ? input.description?.trim() || null : existing.description,
        discountAmount,
        waiverAmount,
        finalAmount,
        dueDate: input.dueDate !== undefined ? toDate(input.dueDate) : existing.dueDate,
        status: input.status ?? existing.status,
      },
    });

    if (input.discountAmount !== undefined && input.discountAmount !== n(existing.discountAmount)) {
      await tx.feeDiscount.create({
        data: {
          coachingCenterId,
          studentFeeAssignmentId: assignmentId,
          type: 'DISCOUNT',
          amount: input.discountAmount,
          reason: input.reason?.trim() || 'Discount adjusted',
          createdById: actorId,
        },
      });
    }
    if (input.waiverAmount !== undefined && input.waiverAmount !== n(existing.waiverAmount)) {
      await tx.feeDiscount.create({
        data: {
          coachingCenterId,
          studentFeeAssignmentId: assignmentId,
          type: 'WAIVER',
          amount: input.waiverAmount,
          reason: input.reason?.trim() || 'Waiver adjusted',
          createdById: actorId,
        },
      });
    }

    return updated;
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: input.status === 'CANCELLED' ? 'STUDENT_FEE_CANCELLED' : 'STUDENT_FEE_UPDATED',
    entity: 'StudentFeeAssignment',
    entityId: assignment.id,
    details: { status: assignment.status, finalAmount: n(assignment.finalAmount) },
  });

  return assignment;
}

import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import type { InvoiceCreateInput, InvoiceUpdateInput } from '@/lib/validations/invoice';
import type { Prisma } from '@prisma/client';

function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

function n(value: Prisma.Decimal | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

/**
 * Generates an atomic, tenant-scoped, sequential invoice number
 * (e.g. INV-2026-000001) using row-locking upsert on the sequence counter,
 * the same concurrency-safe pattern as StudentIdSequence.
 */
export async function generateInvoiceNumber(tx: Prisma.TransactionClient, coachingCenterId: string): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await tx.financialSequence.upsert({
    where: { coachingCenterId_type_year: { coachingCenterId, type: 'INVOICE', year } },
    create: { coachingCenterId, type: 'INVOICE', year, currentNumber: 1 },
    update: { currentNumber: { increment: 1 } },
  });
  return `INV-${year}-${String(sequence.currentNumber).padStart(6, '0')}`;
}

/** Recomputes an invoice's display status from its stored dueDate/dueAmount, without mutating it. */
function computeDisplayStatus(status: string, dueDate: Date | null, dueAmount: number): string {
  if (status === 'CANCELLED' || status === 'DRAFT' || status === 'PAID') return status;
  if (dueDate && dueDate.getTime() < Date.now() && dueAmount > 0) return 'OVERDUE';
  return status;
}

/**
 * Lazily reconciles the stored status of ISSUED/PARTIAL invoices that have
 * aged past their due date to OVERDUE. Idempotent — safe to call on every
 * read, and harmless if raced by a concurrent payment (payment.service
 * recomputes status transactionally from fresh data on every payment).
 */
async function syncOverdueStatuses(coachingCenterId: string, invoiceIds: string[]): Promise<void> {
  if (invoiceIds.length === 0) return;
  await prisma.feeInvoice.updateMany({
    where: {
      id: { in: invoiceIds },
      coachingCenterId,
      status: { in: ['ISSUED', 'PARTIAL'] },
      dueDate: { lt: new Date() },
      dueAmount: { gt: 0 },
    },
    data: { status: 'OVERDUE' },
  });
}

export interface InvoiceFilterParams {
  search?: string;
  branchId?: string;
  studentId?: string;
  batchId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export async function getInvoicesList(coachingCenterId: string, params: InvoiceFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.FeeInvoiceWhereInput = { coachingCenterId };
  if (params.branchId && params.branchId !== 'all') where.branchId = params.branchId;
  if (params.studentId) where.studentId = params.studentId;
  if (params.status && params.status !== 'all') where.status = params.status as Prisma.EnumInvoiceStatusFilter['equals'];
  if (params.dateFrom || params.dateTo) {
    where.invoiceDate = {};
    if (params.dateFrom) where.invoiceDate.gte = new Date(params.dateFrom);
    if (params.dateTo) where.invoiceDate.lte = new Date(`${params.dateTo}T23:59:59.999`);
  }
  if (params.batchId && params.batchId !== 'all') {
    where.student = { studentBatches: { some: { batchId: params.batchId, status: 'ACTIVE' } } };
  }

  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    where.OR = [
      { invoiceNumber: { contains: q, mode: 'insensitive' } },
      { student: { name: { contains: q, mode: 'insensitive' } } },
      { student: { studentIdCode: { contains: q, mode: 'insensitive' } } },
      { student: { phone: { contains: q } } },
    ];
  }

  const [total, invoices] = await Promise.all([
    prisma.feeInvoice.count({ where }),
    prisma.feeInvoice.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { invoiceDate: 'desc' },
      include: {
        student: { select: { id: true, name: true, banglaName: true, studentIdCode: true, phone: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
  ]);

  await syncOverdueStatuses(coachingCenterId, invoices.map((i) => i.id));

  return {
    invoices: invoices.map((inv) => ({
      ...inv,
      status: computeDisplayStatus(inv.status, inv.dueDate, n(inv.dueAmount)),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getInvoiceById(coachingCenterId: string, invoiceId: string) {
  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: invoiceId, coachingCenterId },
    include: {
      student: {
        include: {
          branch: { select: { id: true, name: true } },
          studentGuardians: { where: { isPrimary: true }, include: { guardian: true }, take: 1 },
        },
      },
      branch: true,
      items: { orderBy: { displayOrder: 'asc' } },
      payments: { orderBy: { paymentDate: 'desc' }, include: { refunds: true } },
      discounts: { orderBy: { createdAt: 'desc' } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!invoice) return null;

  await syncOverdueStatuses(coachingCenterId, [invoice.id]);

  return { ...invoice, status: computeDisplayStatus(invoice.status, invoice.dueDate, n(invoice.dueAmount)) };
}

export async function createInvoice(coachingCenterId: string, input: InvoiceCreateInput, actorId?: string) {
  const student = await prisma.student.findFirst({ where: { id: input.studentId, coachingCenterId } });
  if (!student) throw new Error('STUDENT_NOT_FOUND');

  const branchId = input.branchId || student.branchId || null;
  if (branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, coachingCenterId } });
    if (!branch) throw new Error('BRANCH_NOT_FOUND');
  }

  const assignmentIds = input.items.map((i) => i.studentFeeAssignmentId).filter((v): v is string => !!v);
  if (assignmentIds.length) {
    const validCount = await prisma.studentFeeAssignment.count({
      where: { id: { in: assignmentIds }, coachingCenterId, studentId: input.studentId },
    });
    if (validCount !== new Set(assignmentIds).size) {
      throw new Error('One or more selected fee assignments are invalid for this student');
    }
  }

  // Server recalculates every total from the submitted items — client totals are never trusted.
  const computedItems = input.items.map((item, idx) => {
    const gross = item.unitAmount * item.quantity;
    const itemDiscount = Math.min(item.discountAmount, gross);
    const amount = Math.max(0, gross - itemDiscount);
    return {
      studentFeeAssignmentId: item.studentFeeAssignmentId || null,
      description: item.description.trim(),
      quantity: item.quantity,
      unitAmount: item.unitAmount,
      discountAmount: itemDiscount,
      amount,
      displayOrder: idx,
    };
  });

  const subtotalAmount = computedItems.reduce((s, i) => s + i.unitAmount * i.quantity, 0);
  const itemDiscountTotal = computedItems.reduce((s, i) => s + i.discountAmount, 0);
  const extraDiscount = Math.max(0, input.discountAmount);
  const waiverAmount = Math.max(0, input.waiverAmount);
  const discountAmount = itemDiscountTotal + extraDiscount;

  if (discountAmount + waiverAmount > subtotalAmount) {
    throw new Error('Discount and waiver combined cannot exceed the invoice subtotal');
  }

  const totalAmount = Math.max(0, subtotalAmount - discountAmount - waiverAmount);
  const status = !input.issueNow ? 'DRAFT' : totalAmount <= 0 ? 'PAID' : 'ISSUED';

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await generateInvoiceNumber(tx, coachingCenterId);

    const created = await tx.feeInvoice.create({
      data: {
        coachingCenterId,
        branchId,
        studentId: input.studentId,
        invoiceNumber,
        invoiceDate: toDate(input.invoiceDate) || new Date(),
        dueDate: toDate(input.dueDate),
        subtotalAmount,
        discountAmount,
        waiverAmount,
        totalAmount,
        paidAmount: 0,
        dueAmount: totalAmount,
        status,
        notes: input.notes?.trim() || null,
        createdById: actorId,
        items: { create: computedItems },
      },
      include: { items: true },
    });

    if (extraDiscount > 0) {
      await tx.feeDiscount.create({
        data: {
          coachingCenterId,
          feeInvoiceId: created.id,
          type: 'DISCOUNT',
          amount: extraDiscount,
          reason: 'Invoice-level discount',
          createdById: actorId,
        },
      });
    }
    if (waiverAmount > 0) {
      await tx.feeDiscount.create({
        data: {
          coachingCenterId,
          feeInvoiceId: created.id,
          type: 'WAIVER',
          amount: waiverAmount,
          reason: 'Invoice-level waiver',
          createdById: actorId,
        },
      });
    }

    return created;
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'INVOICE_CREATED',
    entity: 'FeeInvoice',
    entityId: invoice.id,
    details: { invoiceNumber: invoice.invoiceNumber, studentId: input.studentId, totalAmount },
  });

  return invoice;
}

export async function updateInvoice(
  coachingCenterId: string,
  invoiceId: string,
  input: InvoiceUpdateInput,
  actorId?: string
) {
  const existing = await prisma.feeInvoice.findFirst({ where: { id: invoiceId, coachingCenterId } });
  if (!existing) throw new Error('INVOICE_NOT_FOUND');
  if (existing.status === 'CANCELLED') throw new Error('Invoice is cancelled');

  const invoice = await prisma.feeInvoice.update({
    where: { id: invoiceId },
    data: {
      dueDate: input.dueDate !== undefined ? toDate(input.dueDate) : existing.dueDate,
      notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'INVOICE_UPDATED',
    entity: 'FeeInvoice',
    entityId: invoice.id,
    details: { invoiceNumber: invoice.invoiceNumber },
  });

  return invoice;
}

export async function cancelInvoice(coachingCenterId: string, invoiceId: string, actorId?: string) {
  const existing = await prisma.feeInvoice.findFirst({ where: { id: invoiceId, coachingCenterId } });
  if (!existing) throw new Error('INVOICE_NOT_FOUND');
  if (existing.status === 'CANCELLED') throw new Error('Invoice is already cancelled');
  if (n(existing.paidAmount) > 0) {
    throw new Error('Cannot cancel an invoice that already has payments recorded — refund the payments first');
  }

  const invoice = await prisma.feeInvoice.update({
    where: { id: invoiceId },
    data: { status: 'CANCELLED' },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'INVOICE_CANCELLED',
    entity: 'FeeInvoice',
    entityId: invoice.id,
    details: { invoiceNumber: invoice.invoiceNumber },
  });

  return invoice;
}

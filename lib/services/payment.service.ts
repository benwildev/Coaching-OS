import prisma from '@/lib/db';
import { recordAuditLog } from './audit.service';
import { notifyStudentGuardians } from './guardian-notify.service';
import type { PaymentCreateInput, PaymentRefundInput } from '@/lib/validations/payment';
import type { Prisma } from '@prisma/client';

function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

function n(value: Prisma.Decimal | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

/** Atomic, tenant-scoped, sequential receipt number (e.g. RCP-2026-000001). */
export async function generateReceiptNumber(tx: Prisma.TransactionClient, coachingCenterId: string): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await tx.financialSequence.upsert({
    where: { coachingCenterId_type_year: { coachingCenterId, type: 'RECEIPT', year } },
    create: { coachingCenterId, type: 'RECEIPT', year, currentNumber: 1 },
    update: { currentNumber: { increment: 1 } },
  });
  return `RCP-${year}-${String(sequence.currentNumber).padStart(6, '0')}`;
}

/**
 * Records a payment against an invoice inside a single Prisma transaction.
 *
 * Overpayment safety: rather than read-then-write (which races under
 * concurrent requests), the invoice's paid/due amounts are updated with a
 * single conditional `updateMany` whose WHERE clause re-checks
 * `dueAmount >= amount` and a non-terminal status at the database row level.
 * Postgres serializes concurrent UPDATEs to the same row — the second
 * transaction only sees the first's committed decrement once its own lock is
 * granted — so `count === 0` reliably means "no longer affordable" even
 * under a race between two simultaneous payment requests for the same
 * invoice (see AGENTS.md Phase 5 §36/§43 scenario 8).
 */
export async function createPayment(
  coachingCenterId: string,
  invoiceId: string,
  input: PaymentCreateInput,
  actorId?: string
) {
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  // Phase 10.5: a double-submit (double-click, or a client retrying after
  // a timed-out response whose payment actually landed) with the same
  // idempotencyKey returns the ALREADY-created payment instead of making a
  // second one. This pre-check handles the common case cheaply; the
  // (coachingCenterId, idempotencyKey) unique index (caught below) is the
  // real safety net for two requests racing each other.
  if (idempotencyKey) {
    // Scoped to this invoiceId too, not just (coachingCenterId,
    // idempotencyKey) — otherwise a key that collided with a payment made
    // against a DIFFERENT invoice (a different branch/student) would be
    // replayed back here, bypassing the branch check the caller already
    // ran against THIS invoiceId.
    const existing = await prisma.payment.findFirst({ where: { coachingCenterId, invoiceId, idempotencyKey }, include: { invoice: true } });
    if (existing) {
      return { payment: existing, invoice: existing.invoice, idempotentReplay: true as const };
    }
  }

  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: invoiceId, coachingCenterId },
    include: { items: true },
  });
  if (!invoice) throw new Error('INVOICE_NOT_FOUND');
  if (invoice.status === 'CANCELLED') throw new Error('Invoice is cancelled — payment cannot be recorded');
  if (invoice.status === 'PAID') throw new Error('Invoice is already fully paid');
  if (input.amount > n(invoice.dueAmount)) {
    throw new Error('Payment amount exceeds the outstanding due amount');
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const receiptNumber = await generateReceiptNumber(tx, coachingCenterId);

      const payment = await tx.payment.create({
        data: {
          coachingCenterId,
          branchId: invoice.branchId,
          studentId: invoice.studentId,
          invoiceId,
          receiptNumber,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          transactionId: input.transactionId?.trim() || null,
          referenceNumber: input.referenceNumber?.trim() || null,
          senderMobile: input.senderMobile?.trim() || null,
          bankName: input.bankName?.trim() || null,
          chequeNumber: input.chequeNumber?.trim() || null,
          paymentDate: toDate(input.paymentDate) || new Date(),
          notes: input.notes?.trim() || null,
          status: 'COMPLETED',
          collectedById: actorId,
          idempotencyKey,
        },
      });

      // Conditional atomic guard — see function docstring.
      const guarded = await tx.feeInvoice.updateMany({
        where: {
          id: invoiceId,
          coachingCenterId,
          status: { notIn: ['CANCELLED', 'PAID'] },
          dueAmount: { gte: input.amount },
        },
        data: {
          paidAmount: { increment: input.amount },
          dueAmount: { decrement: input.amount },
        },
      });
      if (guarded.count === 0) {
        throw new Error('Payment amount exceeds the outstanding due amount');
      }

      const refreshed = await tx.feeInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const dueAmount = n(refreshed.dueAmount);
      const newStatus =
        dueAmount <= 0
          ? 'PAID'
          : refreshed.dueDate && refreshed.dueDate.getTime() < Date.now()
            ? 'OVERDUE'
            : 'PARTIAL';

      const updatedInvoice = await tx.feeInvoice.update({
        where: { id: invoiceId },
        data: { status: newStatus },
      });

      // Update linked StudentFeeAssignment statuses: fully reflects invoice
      // outcome only once the invoice itself is fully settled; otherwise moves
      // pending assignments to PARTIAL so the student profile reflects billing
      // progress without prematurely marking anything PAID.
      const assignmentIds = Array.from(
        new Set(invoice.items.map((i) => i.studentFeeAssignmentId).filter((v): v is string => !!v))
      );
      if (assignmentIds.length) {
        await tx.studentFeeAssignment.updateMany({
          where: { id: { in: assignmentIds }, status: { notIn: ['WAIVED', 'CANCELLED'] } },
          data: { status: newStatus === 'PAID' ? 'PAID' : 'PARTIAL' },
        });
      }

      await recordAuditLog({
        coachingCenterId,
        userId: actorId,
        action: 'PAYMENT_CREATED',
        entity: 'Payment',
        entityId: payment.id,
        details: {
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          studentId: invoice.studentId,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          receiptNumber,
          transactionId: input.transactionId || null,
          referenceNumber: input.referenceNumber || null,
        },
      });

      return { payment, invoice: updatedInvoice };
    });
  } catch (err) {
    // Lost the race to a concurrent request carrying the same
    // idempotencyKey — return what THAT request created instead of
    // failing this one (the DB unique index is the real safety net here;
    // the pre-check above only handles the non-concurrent common case).
    if (idempotencyKey && err instanceof Error && /Unique constraint/i.test(err.message) && /idempotencyKey/i.test(err.message)) {
      // The unique index is (coachingCenterId, idempotencyKey) only — but
      // only treat this as a same-invoice replay when the winning row
      // actually matches THIS invoiceId too. If the key collided with a
      // payment made against a different invoice, that's a genuine
      // client-side key-reuse bug, not a same-request race — surface the
      // original error rather than handing back an unrelated invoice.
      const winner = await prisma.payment.findFirst({ where: { coachingCenterId, invoiceId, idempotencyKey }, include: { invoice: true } });
      if (winner) return { payment: winner, invoice: winner.invoice, idempotentReplay: true as const };
    }
    throw err;
  }

  const student = await prisma.student.findUnique({ where: { id: invoice.studentId }, select: { name: true } });
  await notifyStudentGuardians({
    coachingCenterId,
    branchId: invoice.branchId,
    studentId: invoice.studentId,
    event: 'FEE_PAYMENT_RECEIVED',
    vars: {
      studentName: student?.name,
      amount: n(result.payment.amount).toFixed(2),
      paymentDate: result.payment.paymentDate.toISOString().slice(0, 10),
    },
    triggeredById: actorId,
    sourceType: 'Payment',
    sourceId: result.payment.id,
  });

  return result;
}

export interface PaymentFilterParams {
  search?: string;
  branchId?: string;
  studentId?: string;
  paymentMethod?: string;
  collectedById?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export async function getPaymentsList(coachingCenterId: string, params: PaymentFilterParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.PaymentWhereInput = { coachingCenterId };
  if (params.branchId && params.branchId !== 'all') where.branchId = params.branchId;
  if (params.studentId) where.studentId = params.studentId;
  if (params.paymentMethod && params.paymentMethod !== 'all') where.paymentMethod = params.paymentMethod as Prisma.EnumPaymentMethodFilter['equals'];
  if (params.collectedById && params.collectedById !== 'all') where.collectedById = params.collectedById;
  if (params.status && params.status !== 'all') where.status = params.status as Prisma.EnumPaymentStatusFilter['equals'];
  if (params.dateFrom || params.dateTo) {
    where.paymentDate = {};
    if (params.dateFrom) where.paymentDate.gte = new Date(params.dateFrom);
    if (params.dateTo) where.paymentDate.lte = new Date(`${params.dateTo}T23:59:59.999`);
  }

  if (params.search && params.search.trim()) {
    const q = params.search.trim();
    where.OR = [
      { receiptNumber: { contains: q, mode: 'insensitive' } },
      { transactionId: { contains: q, mode: 'insensitive' } },
      { invoice: { invoiceNumber: { contains: q, mode: 'insensitive' } } },
      { student: { name: { contains: q, mode: 'insensitive' } } },
      { student: { studentIdCode: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { paymentDate: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            studentIdCode: true,
            studentGuardians: { where: { isPrimary: true }, take: 1, select: { guardian: { select: { id: true, name: true, phone: true } } } },
          },
        },
        invoice: { select: { id: true, invoiceNumber: true } },
        collectedBy: { select: { id: true, name: true } },
        refunds: true,
      },
    }),
  ]);

  return {
    payments: payments.map((p) => {
      const { studentGuardians, ...student } = p.student;
      return { ...p, student, guardian: studentGuardians[0]?.guardian ?? null };
    }),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getPaymentById(coachingCenterId: string, paymentId: string) {
  return prisma.payment.findFirst({
    where: { id: paymentId, coachingCenterId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          banglaName: true,
          studentIdCode: true,
          branch: { select: { id: true, name: true } },
        },
      },
      invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, dueAmount: true } },
      branch: { select: { id: true, name: true } },
      collectedBy: { select: { id: true, name: true } },
      refunds: { orderBy: { createdAt: 'desc' }, include: { refundedBy: { select: { id: true, name: true } } } },
    },
  });
}

/**
 * Refunds part or all of a completed payment. The original Payment row is
 * never modified — a PaymentRefund row is added, and the payment's status
 * plus the invoice's paid/due totals are recalculated transactionally.
 *
 * Refund-balance safety: a cheap pre-check runs first (below), but the
 * authoritative check happens INSIDE the transaction after taking a
 * `SELECT ... FOR UPDATE` row lock on the payment — a second concurrent
 * refund request for the same payment blocks until the first commits, then
 * re-reads the now-updated sum of refunds before deciding whether its own
 * amount still fits. Without this lock, two refunds racing on the same
 * payment could both pass a stale "already refunded" check and together
 * refund more than the payment ever collected.
 */
export async function refundPayment(
  coachingCenterId: string,
  paymentId: string,
  input: PaymentRefundInput,
  actorId?: string
) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, coachingCenterId },
    include: { refunds: true, invoice: true },
  });
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');
  if (payment.status === 'VOIDED') throw new Error('Payment has been voided');

  const alreadyRefunded = payment.refunds.reduce((s, r) => s + n(r.amount), 0);
  const refundable = n(payment.amount) - alreadyRefunded;
  if (input.amount > refundable) {
    throw new Error('Refund amount exceeds the refundable balance for this payment');
  }

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ amount: Prisma.Decimal }[]>`SELECT amount FROM payments WHERE id = ${paymentId} FOR UPDATE`;
    if (locked.length === 0) throw new Error('PAYMENT_NOT_FOUND');
    const refundedAgg = await tx.paymentRefund.aggregate({ where: { paymentId }, _sum: { amount: true } });
    const refundedSoFar = n(refundedAgg._sum.amount);
    const stillRefundable = n(locked[0].amount) - refundedSoFar;
    if (input.amount > stillRefundable) {
      throw new Error('Refund amount exceeds the refundable balance for this payment');
    }

    const refund = await tx.paymentRefund.create({
      data: {
        coachingCenterId,
        paymentId,
        amount: input.amount,
        reason: input.reason.trim(),
        referenceNumber: input.referenceNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        refundedById: actorId,
      },
    });

    const totalRefundedNow = refundedSoFar + input.amount;
    const newPaymentStatus = totalRefundedNow >= n(locked[0].amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    await tx.payment.update({
      where: { id: paymentId },
      data: { status: newPaymentStatus },
    });

    // Reduce the invoice's paid amount and reopen its due balance; guarded
    // against going negative even under concurrent refunds.
    const guarded = await tx.feeInvoice.updateMany({
      where: { id: payment.invoiceId, coachingCenterId, paidAmount: { gte: input.amount } },
      data: {
        paidAmount: { decrement: input.amount },
        dueAmount: { increment: input.amount },
      },
    });
    if (guarded.count === 0) {
      throw new Error('Refund could not be applied — invoice paid balance is inconsistent');
    }

    const refreshedInvoice = await tx.feeInvoice.findUniqueOrThrow({ where: { id: payment.invoiceId } });
    const dueAmount = n(refreshedInvoice.dueAmount);
    const invoiceStatus =
      dueAmount <= 0
        ? 'PAID'
        : n(refreshedInvoice.paidAmount) > 0
          ? refreshedInvoice.dueDate && refreshedInvoice.dueDate.getTime() < Date.now()
            ? 'OVERDUE'
            : 'PARTIAL'
          : refreshedInvoice.dueDate && refreshedInvoice.dueDate.getTime() < Date.now()
            ? 'OVERDUE'
            : 'ISSUED';

    await tx.feeInvoice.update({ where: { id: payment.invoiceId }, data: { status: invoiceStatus } });

    await recordAuditLog({
      coachingCenterId,
      userId: actorId,
      action: 'REFUND_CREATED',
      entity: 'PaymentRefund',
      entityId: refund.id,
      details: {
        paymentId,
        receiptNumber: payment.receiptNumber,
        amount: input.amount,
        reason: input.reason,
      },
    });

    return refund;
  });

  return result;
}
